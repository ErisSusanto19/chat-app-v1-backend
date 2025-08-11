const mongoose = require('mongoose');
const UserConversation = require('../models/userConversation');

async function getCompleteConversationForUser(userId, conversationId) {
    try {
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const conversationObjectId = new mongoose.Types.ObjectId(conversationId);

        const result = await UserConversation.aggregate([
            { $match: { userId: userObjectId, conversationId: conversationObjectId } },
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
                    { $addFields: { displayName: { $ifNull: ["$contactEntry.name", "$partner.name"] } } },
                    { $project: { _id: 1, role: 1, isGroup: "$conversation.isGroup", conversationId: "$conversation._id", name: "$displayName", image: "$partner.image", lastMessage: "$conversation.lastMessage", createdAt: 1, updatedAt: 1, partner: 1, unreadCount: 1 } }
                ]
            }},
            { $project: { allConversation: { $setUnion: ["$groupConversation", "$privateConversation"] } } },
            { $unwind: "$allConversation" },
            { $replaceRoot: { newRoot: "$allConversation" } }
        ]);
        
        return result.length > 0 ? result[0] : null;
    } catch (error) {
        console.error(`[HELPER ERROR] Failed to get complete conversation for user ${userId}:`, error);
        return null;
    }
}

module.exports = { getCompleteConversationForUser };