const assyncHandler = require('express-async-handler')
const UserConversation = require('../models/userConversation')
const mongoose = require('mongoose')

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
            
                        //Sajikan data dalam bentuk yang diinginkan
                        {
                            $project: {
                                _id: 1,
                                role: 1,
                                isGroup: "$conversation.isGroup",
                                conversationId: "$conversation._id",
                                name: "$partner.name",
                                image: "$partner.image",
                                lastMessage: "$conversation.lastMessage",
                                createdAt: 1,
                                updatedAt: 1,
                                // pivotPartner: 1,
                                partner: 1
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

            //5. Urutkan hasil berdasar lastMessage.timestamps atau createdAt dari userconversations
            {
                $unwind: "$allConversation"
            },
            {
                $addFields: {
                    sortedByTimestamps:{
                        $cond: {
                            if: {$ne: ["$allConversation.lastMessage", null]},
                            then: "$allConversation.lastMessage.timestamps",
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
}

module.exports = UserConversationController