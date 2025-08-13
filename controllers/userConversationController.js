const assyncHandler = require('express-async-handler')
const UserConversation = require('../models/userConversation')
const mongoose = require('mongoose')
const Conversation = require('../models/conversation')
const generateError = require('../helpers/generateError')
const User = require('../models/user')
const Message = require('../models/message')
const Contact = require('../models/contact')
const { getCompleteConversationForUser } = require('../helpers/conversationHelpers');

class UserConversationController {
    static getUserConversations = assyncHandler(async(req, res) => {
        const userId = req.user.id
        
        //Untuk menggunakan agregate() maka ObjectId diperlukan untuk convert string id
        let userConversations = await UserConversation.aggregate([
            //1. Ambil userConversation berdasar user yang login
            {$match: {userId: new mongoose.Types.ObjectId(userId)}},

            //2. Join ke collection 'conversations'. Ambil Conversation berdasar conversationId hasil dari step 1
            {
                $lookup: {
                    from: "conversations", // table/collection yang akan diambil
                    localField: "conversationId", // field foreign key dari userConversation
                    foreignField: "_id", // field primary key dari conversations, meski nama property disini adalah foreignField, namun makna ini menurut pov dari userConversation selaku pelaku utama yang meminta join ke conversations
                    as: "conversation" // semacam wadah untuk menaruh hasil join, bebas penamaannya
                }
            },
            {$unwind: "$conversation"}, //hasil dari lookup itu berupa array, maka disini perlu dibongkar

            {
                $lookup: {
                    from: "messages",
                    let: {conversationId: "$conversation._id"},
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {$eq: ["$conversationId", "$$conversationId"]},
                                        {$ne: ["$senderId", new mongoose.Types.ObjectId(userId)]},
                                        {$ne: ["$status", "read"]}
                                    ]
                                }
                            }
                        },
                        {$count: "count"}
                    ],
                    as: "unreadMessages"
                }
            },

            {
                $addFields: {
                    unreadCount: {
                        $ifNull: [
                            { $getField: { field: "count", input: { $arrayElemAt: ["$unreadMessages", 0] } } },
                            0
                        ]
                    }
                }
            },

            //3. Buat cabang query nya
            {
                $facet: {
                    //Cabang Pertama
                    groupConversation: [
                        {$match: {"conversation.isGroup": true}},
                        {
                            $project: {
                                _id: 1,
                                role: 1,
                                isGroup: "$conversation.isGroup",
                                conversationId: "$conversation._id",
                                name: "$conversation.name",
                                image: "$conversation.image",
                                lastMessage: "$conversation.lastMessage",
                                createdAt: 1,
                                updatedAt: 1,
                                unreadCount: 1
                            }
                        }
                    ],

                    //Cabang kedua
                    privateConversation: [
                        {$match: {"conversation.isGroup": false}},

                        //Join ke collection 'userconversations'. Cari pivot user lain dalam conversation yang sama (partner chat), artinya ini akan mencari (pivot) userConversation yang lain tapi memiliki conversationId yang sama
                        {
                            $lookup: {
                                from: "userconversations",
                                let: {conversationId: "$conversationId", currentUser: "$userId"}, //Mengaliskan nama field lokal agar lebih mudah dipahami bahwa ini adalah pivot dari user yang sedang login
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    {$eq: ["$conversationId", "$$conversationId"]}, // filter dengan conversationId yang sama dengan pivot user login
                                                    {$ne: ["$userId", "$$currentUser"]} //filter yang id nya bukan id user login
                                                ]
                                            }
                                        }
                                    },
                                ],
                                as: "pivotPartner" // simpan pivot user partner chat yang sudah ketemu
                            },
                        },
                        // {$unwind: "$pivotPartner"}, // bongkar arraynya, harusnya hanya ada 1 partner dalam private conversation
                        // pivotPartner tidak jadi dibongkar, dibiarkan dalam bentuk array agar mudah dicek isinya ada tau tidak, kalau ada tinggal ambil elemen pertama yang mana elemen tersebut pasti berbentuk objek
            
                        //Tambah field tambahan untuk menyimpan userId dari partner, ini agar proses join ke master users lebih mudah
                        {
                            $addFields: {
                                pivotPartnerId: {
                                    $ifNull: [
                                        {
                                            $getField: {
                                                field: "userId", 
                                                input: {$arrayElemAt: ["$pivotPartner", 0]}
                                            }
                                        },
                                        null
                                    ]
                                }
                            }
                        },
            
                        //Join ke collection 'users'. Cari data master User berdasar id yang terkandung dalam pivotPartner
                        {
                            $lookup: {
                                from: "users",
                                // localField: "pivotPartnerId",
                                // foreignField: "_id",
                                let: {partnerId: "$pivotPartnerId"},
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    {$eq: ["$_id", "$$partnerId"]}
                                                ]
                                            }
                                        }
                                    },
                                    {$project: {_id: 1, name: 1, email: 1, image: 1}}
                                ],
                                as: "partner"
                            }
                        },
                        // {$unwind: "$partner"},// bongkar array nya, agar menjadi objek
                        //Tidak perlu dibongkar, biarkan saja dalam bentuk array untuk pengecekan isi array
            
                        //Buat field baru dengan nama yang sama yaitu 'partner', tujuannya adalah untuk menimpa partner hasil join step 4 dengan null apabila hasilnya array kosong
                        {
                            $addFields: {
                                partner: {
                                    $cond: {
                                        if: {$gt: [{$size: "$partner"}, 0]}, //Apakah panjang array partner lebih dari 0
                                        then: {$arrayElemAt: ["$partner", 0]}, //Ambil elemen pertama, ini akan berupa objek data user
                                        else: null
                                    }
                                }
                            }
                        },

                        // //Join ke collection 'contacts'. Cari di daftar kontak milik PENGGUNA SAAT INI (currentUser)
                        // untuk melihat apakah ada entri yang cocok dengan ID partner chat.
                        {
                            $lookup: {
                                from: "contacts",
                                let: { 
                                    currentUser: "$userId",
                                    partnerEmail: "$partner.email"
                                },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: ["$userId", "$$currentUser"] }, 
                                                    { $eq: ["$email", "$$partnerEmail"] }
                                                ]
                                            }
                                        }
                                    }
                                ],
                                as: "contactDetails"
                            }
                        },

                        // Prioritaskan nama dari 'contacts', jika tidak ada, baru gunakan nama dari 'users'.
                        {
                            $addFields: {
                                contactEntry: { $arrayElemAt: ["$contactDetails", 0] }
                            }
                        },
                        {
                            $addFields: {
                                displayName: {
                                    $ifNull: ["$contactEntry.name", "$partner.email"]
                                }
                            }
                        },
            
                        //Sajikan data dalam bentuk yang diinginkan
                        {
                            $project: {
                                _id: 1,
                                role: 1,
                                isGroup: "$conversation.isGroup",
                                conversationId: "$conversation._id",
                                name: "$displayName",
                                image: "$partner.image",
                                lastMessage: "$conversation.lastMessage",
                                createdAt: 1,
                                updatedAt: 1,
                                partner: 1,
                                unreadCount: 1
                            }
                        }
                    ]
                }
            },

            //4. Gabungan hasil groupConversation dan privateConversation
            {
                $project: {
                    allConversation: {$setUnion: ["$groupConversation", "$privateConversation"]}
                }
            },

            //5. Urutkan hasil berdasar lastMessage.createdAt atau createdAt dari userconversations
            {
                $unwind: "$allConversation"
            },
            {
                $addFields: {
                    sortedByTimestamps:{
                        $cond: {
                            if: {$ne: ["$allConversation.lastMessage", null]},
                            then: "$allConversation.lastMessage.createdAt",
                            else: "$allConversation.createdAt"
                        }
                    }
                }
            },
            {
                $sort: {sortedByTimestamps: -1}
            },
            {
                $replaceRoot: {newRoot: "$allConversation"}
            }

        ])

        res.status(200).json(userConversations)
    })

    //Ini untuk keperluan menambah anggota group
    static addPivotUserConversation = async(req, res, next) => {
        const userId = req.user.id
        const conversartionId = req.params

        //Participants berisi array of email yang diambil dari contact
        const {participants} = req.body

        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            let conversation = await Conversation.findById(conversartionId).session(session).lean()
            if(!conversation){
                generateError("Conversation not found", 404)
            }
            if(conversation.isGroup !== true){
                generateError("This feature is only available for group conversations.")
            }

            if(!Array.isArray(participants)){
                generateError("Participants must be an array", 400)
            }
            if(participants.length < 1){
                generateError("Adding a member to a group requires a valid contact", 400)
            }

            //Cari master user berdasar email contact
            let registeredUsers = await User.find({email: {$in: participants}}).session(session).select("name email image").lean()
            if(registeredUsers.length !== participants.length){
                generateError("One or more contacts are not regitered users", 400)
            }

            let dataEntriesPivots = []
            registeredUsers.map(user => {
                dataEntriesPivots.push({
                    userId: user._id,
                    conversartionId,
                    role: "Member"
                })
            })

            //Buat Pivot
            let userConversations = await UserConversation.insertMany(dataEntriesPivots, {session})

            let dataEntriesMessages = []
            registeredUsers.map(user => {
                dataEntriesMessages.push({
                    senderId: userId,
                    conversartionId,
                    content: {
                        type: "notification",
                        url: null,
                        message: `${user.email} joined this group`
                    }
                })
            })

            //Buat message notofication
            let notifications = await Message.insertMany(dataEntriesMessages, {session})

            res.status(201).json(userConversations)
        } catch (error) {
            await session.abortTransaction()
            session.endSession()

            next(error)
        } finally{
            session.endSession()
        }
    }

    static getUserConversationsWithSearchAndFilter = assyncHandler(async(req, res) => {
        const userId = req.user.id
        const { search } = req.query

        let conversationIdsToFilter = null

        //#1
        if (search && search.trim() !== '') {
            const searchTrimmed = search.trim();

            // Messages (by any term)
            const matchingMessages = await Message.find({ $text: { $search: searchTrimmed } }).select('conversationId').lean();
            
            // Conversations (by group name)
            const matchingConversations = await Conversation.find({ $text: { $search: searchTrimmed }, isGroup: true }).select('_id').lean();
            
            // User (by name) and Contact (by name) 
            const userAndContactQuery = { $text: { $search: searchTrimmed } };
            const matchingUsers = await User.find(userAndContactQuery).select('_id').lean();
            const matchingContacts = await Contact.find(userAndContactQuery).where('userId').equals(userId).select('email').lean();

            // Dapatkan semua ID pengguna yang relevan dari hasil pencarian nama
            const emailsFromContacts = matchingContacts.map(c => c.email);
            const usersFromEmails = await User.find({ email: { $in: emailsFromContacts } }).select('_id').lean();
            const allRelevantUserIds = [...new Set([...matchingUsers.map(u => u._id.toString()), ...usersFromEmails.map(u => u._id.toString())])];
            
            // Dapatkan percakapan yang melibatkan pengguna yang relevan
            const convosFromUsers = await UserConversation.find({ userId: { $in: allRelevantUserIds } }).select('conversationId').lean();

            // Gabungkan semua ID percakapan dari semua sumber (pesan, nama grup, nama partner/kontak)
            const allFoundIds = [
                ...matchingMessages.map(m => m.conversationId.toString()),
                ...matchingConversations.map(c => c._id.toString()),
                ...convosFromUsers.map(uc => uc.conversationId.toString())
            ];
            
            conversationIdsToFilter = [...new Set(allFoundIds)];

            if (conversationIdsToFilter.length === 0) {
                return res.status(200).json([]);
            }
        }

        //#2
        const userObjectId = new mongoose.Types.ObjectId(userId);
        let pipeline = [
            { $match: { userId: userObjectId } },
        ];

        if (conversationIdsToFilter) {
            pipeline.push({
                $match: {
                    conversationId: { $in: conversationIdsToFilter.map(id => new mongoose.Types.ObjectId(id)) }
                }
            });
        }

        pipeline.push(
            { $lookup: { from: "conversations", localField: "conversationId", foreignField: "_id", as: "conversation" } },
            { $unwind: "$conversation" },
            {
                $lookup: {
                    from: "messages",
                    let: { conversationId: "$conversation._id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$conversationId", "$$conversationId"] },
                                        { $ne: ["$senderId", userObjectId] },
                                        { $ne: ["$status", "read"] }
                                    ]
                                }
                            }
                        },
                        { $count: "count" }
                    ],
                    as: "unreadMessages"
                }
            },
            {
                $addFields: {
                    unreadCount: {
                        $ifNull: [{ $getField: { field: "count", input: { $arrayElemAt: ["$unreadMessages", 0] } } }, 0]
                    }
                }
            },
            { $facet: {
                groupConversation: [
                    { $match: { "conversation.isGroup": true } },
                    { $project: { _id: 1, role: 1, isGroup: "$conversation.isGroup", conversationId: "$conversation._id", name: "$conversation.name", image: "$conversation.image", lastMessage: "$conversation.lastMessage", createdAt: 1, updatedAt: 1, unreadCount: 1 } }
                ],
                privateConversation: [
                    { $match: { "conversation.isGroup": false } },
                    { $lookup: { from: "userconversations", let: { conversationId: "$conversationId", currentUser: "$userId" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$conversationId", "$$conversationId"] }, { $ne: ["$userId", "$$currentUser"] }] } } }], as: "pivotPartner" } },
                    { $addFields: { pivotPartnerId: { $ifNull: [{ $getField: { field: "userId", input: { $arrayElemAt: ["$pivotPartner", 0] } } }, null] } } },
                    { $lookup: { from: "users", let: { partnerId: "$pivotPartnerId" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$_id", "$$partnerId"] }] } } }, { $project: { _id: 1, name: 1, email: 1, image: 1 } }], as: "partner" } },
                    { $addFields: { partner: { $cond: { if: { $gt: [{ $size: "$partner" }, 0] }, then: { $arrayElemAt: ["$partner", 0] }, else: null } } } },
                    { $lookup: { from: "contacts", let: { currentUser: "$userId", partnerEmail: "$partner.email" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$userId", "$$currentUser"] }, { $eq: ["$email", "$$partnerEmail"] }] } } }], as: "contactDetails" } },
                    { $addFields: { contactEntry: { $arrayElemAt: ["$contactDetails", 0] } } },
                    { $addFields: { displayName: { $ifNull: ["$contactEntry.name", "$partner.email"] } } },
                    { $project: { _id: 1, role: 1, isGroup: "$conversation.isGroup", conversationId: "$conversation._id", name: "$displayName", image: "$partner.image", lastMessage: "$conversation.lastMessage", createdAt: 1, updatedAt: 1, partner: 1, unreadCount: 1 } }
                ]
            }},
            { $project: { allConversation: { $setUnion: ["$groupConversation", "$privateConversation"] } } },
            { $unwind: "$allConversation" },
            { $sort: { "conversation.updatedAt": -1 } },
            { $replaceRoot: { newRoot: "$allConversation" } }
        );
        
        const conversations = await UserConversation.aggregate(pipeline);

        //#3 (Opsional)
        const onlineUsers = require('../sockets/onlineUsers');
        const conversationsWithStatus = conversations.map(convo => {
            if (convo.partner?._id) {
                convo.partner.isOnline = onlineUsers.has(convo.partner._id.toString());
            }
            return convo;
        });

        res.status(200).json(conversationsWithStatus);
    })
}

module.exports = UserConversationController