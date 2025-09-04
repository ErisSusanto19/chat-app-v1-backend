const mongoose = require('mongoose');
const UserConversation = require('../models/userConversation');
const onlineUsers = require('../sockets/onlineUsers');

function buildConversationEnrichmentPipeline(userObjectId) {
    return [
        { $lookup: { from: "conversations", localField: "conversationId", foreignField: "_id", as: "conversation" } },
        { $unwind: "$conversation" },
        {
            $lookup: {
                from: "messages",
                let: { conversationId: "$conversation._id" },
                pipeline: [
                    { $match: { $expr: { $and: [ { $eq: ["$conversationId", "$$conversationId"] }, { $ne: ["$senderId", userObjectId] }, { $ne: ["$status", "read"] } ] } } },
                    { $count: "count" }
                ],
                as: "unreadMessages"
            }
        },
        { $addFields: { unreadCount: { $ifNull: [{ $getField: { field: "count", input: { $arrayElemAt: ["$unreadMessages", 0] } } }, 0] } } },
        { 
            $facet: {
                groupConversation: [
                    { $match: { "conversation.isGroup": true } },
                    { 
                        $lookup: {
                            from: "userconversations",
                            let: { conversationId: "$conversation._id"},
                            pipeline: [
                                { $match: { $expr: { $eq: ["$conversationId", "$$conversationId"]}}},
                                { $count: "count" }
                            ],
                            as: "members"
                        }
                    },
                    { 
                        $project: { 
                            _id: 1, 
                            role: 1,
                            conversationId: "$conversation._id",
                            isGroup: "$conversation.isGroup", 
                            name: "$conversation.name", 
                            image: "$conversation.image",
                            lastMessage: "$conversation.lastMessage", 
                            unreadCount: 1,
                            memberCount: { $ifNull: [{ $getField: { field: "count", input: { $arrayElemAt: ["$members", 0]}}}, 0]},
                            createdAt: 1,
                            createdBy: "$conversation.createdBy"
                        } 
                    }
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
                    { 
                        $project: { 
                            _id: 1, 
                            role: 1, 
                            conversationId: "$conversation._id",
                            isGroup: "$conversation.isGroup",
                            name: "$displayName", 
                            image: "$partner.image", 
                            lastMessage: "$conversation.lastMessage", 
                            unreadCount: 1,
                            partner: 1,
                            createdAt: 1,
                            createdBy: "$conversation.createdBy"
                        } 
                    }
                ]
            }
        },
        { $project: { allConversation: { $setUnion: ["$groupConversation", "$privateConversation"] } } },
        { $unwind: "$allConversation" },
        { $replaceRoot: { newRoot: "$allConversation" } }
    ];
}

async function getFullConversationsForUser(userId, conversationIdsToFilter = null, session = null) {

    const userObjectId = new mongoose.Types.ObjectId(userId);

    let initialMatchStage = { userId: userObjectId };

    let pipeline = [
        { $match: initialMatchStage },
    ];

    if (conversationIdsToFilter && conversationIdsToFilter.length > 0) {
        pipeline.push({
            $match: {
                conversationId: { $in: conversationIdsToFilter.map(id => new mongoose.Types.ObjectId(id)) }
            }
        })
    }
    
    pipeline.push(...buildConversationEnrichmentPipeline(userObjectId))

    console.log(pipeline, '<<< pipeline from getFullConversationForUser');

    pipeline.push(
        {
            $addFields: {
                sortKey: { $ifNull: ["$lastMessage.createdAt", "$createdAt"] },
            }
        },
        { $sort: { sortKey: -1 } }
    );

    let conversations = [];

    if(session){
        const rawConversations = await UserConversation.aggregate(pipeline).session(session);
        conversations = [...rawConversations]
    } else {
        const rawConversations = await UserConversation.aggregate(pipeline).read('primary');
        conversations = [...rawConversations]
    }

    return conversations.map(convo => {
        if (convo.partner?._id) {
            convo.partner.isOnline = onlineUsers.has(convo.partner._id.toString());
        }

        return convo;
    });
}

async function getSingleFullConversation(userId, conversationId, session = null) {

    console.log(userId, '<<< userID');
    console.log(conversationId, '<<< conversationID');
    

    const result = await getFullConversationsForUser(userId, [conversationId], session);
    console.log(`result: `, result);
    
    return result.length > 0 ? result[0] : null;
}

module.exports = { getFullConversationsForUser, getSingleFullConversation };