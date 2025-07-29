const generateError = require("../helpers/generateError")
const Conversation = require("../models/conversation")
const UserConversation = require("../models/userConversation")

const authGroupConversation = async(req, res, next) => {
    const userId = req.user.id
    const {conversationId} = req.params

    try {
        let conversation = await Conversation.findById(conversationId).lean()
        // if(!conversation){
        //     generateError("Conversation not found", 404)
        // }
    
        let userConversation = await UserConversation.findOne({conversationId, userId}).lean()
        // if(!userConversation){
        //     generateError("Pivot userconversation not found", 404)
        // }
    
        let isAllowed = false
    
        if(conversation?.isGroup === true && userConversation?.role === "Admin"){
            isAllowed = true
        }
    
        if(isAllowed === false){
            generateError("Forbiden: You don't have permission to perform this action")
        }
    
        next()
    } catch (error) {
        next(error)
    }

}

module.exports = authGroupConversation