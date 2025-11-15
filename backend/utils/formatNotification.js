export const formatNotificationPayload = ({ sender, chatroom, content, fileType }) => {
    let title = `${sender.name} in ${chatroom.name}`;
    let body = "";

    if (content && content.trim() !== "") {
        body = content.length > 80 ? content.slice(0, 77) + "..." : content;
    } else if (fileType) {
        switch (fileType) {
            case "image":
                body = "📷 shared an image";
                break;
            case "pdf":
            case "document":
                body = "📄 shared a document";
                break;
            default:
                body = "📎 shared a file";
        }
    } else {
        body = "💬 sent a message";
    }

    return {
        title,
        body,
        url: `/chat/${chatroom._id}`,
    };
};
