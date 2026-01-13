# Postman Testing Guide - General Chat WebSocket

This guide provides step-by-step instructions for testing the General Chat WebSocket functionality using Postman.

## Prerequisites

1. **Postman Desktop App** (WebSocket support requires desktop version)
2. **Backend server** running on `http://localhost:3000`
3. **Communications server** running on `http://localhost:3001`
4. **Redis server** running
5. **Valid JWT access token** from authentication

---

## Getting a JWT Token

Before connecting to WebSocket, you need to get a valid JWT token:

### 1. Login via REST API

**Method:** `POST`  
**URL:** `http://localhost:3000/auth/signin`  
**Body (JSON):**
```json
{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "userId": "778159b1-21c9-43cb-b495-87fcc8108692",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "..."
}
```

**Copy the `token` value** - you'll need it for WebSocket authentication.

---

## Step 1: Connect to WebSocket

### Open New WebSocket Request

1. In Postman, click **New** → **WebSocket Request**
2. Enter the URL: `ws://localhost:3001/general-chat`

### Configure Connection

#### Option 1: Using Headers (Recommended for Testing)
In the **Headers** tab:
```
Authorization: Bearer YOUR_JWT_TOKEN_HERE
```

#### Option 2: Using Auth
In the connection message box, send this immediately after connecting:
```json
{
  "auth": {
    "token": "YOUR_JWT_TOKEN_HERE"
  }
}
```

### Connect
Click **Connect** button

### Expected Result
You should see:
```
Connected to ws://localhost:3001/general-chat
```

And in your server logs:
```
Client XYZ123 connected for user 778159b1-21c9-43cb-b495-87fcc8108692
```

---

## Step 2: Join a Room

Before sending messages, you need to join a room.

### Event: `joinRoom`

**Send:**
```json
{
  "event": "joinRoom",
  "data": {
    "roomId": "your-room-uuid-here"
  }
}
```

**Expected Response:**
```json
{
  "success": true
}
```

**Server Logs:**
```
User 778159b1-21c9-43cb-b495-87fcc8108692 joined room your-room-uuid-here
```

**Note:** Replace `your-room-uuid-here` with an actual room ID that exists in your database.

---

## Step 3: Send a Message

### Event: `sendMessage`

**Send:**
```json
{
  "event": "sendMessage",
  "data": {
    "roomId": "your-room-uuid-here",
    "content": "Hello everyone in the room!"
  }
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": {
    "id": "message-uuid",
    "content": "Hello everyone in the room!",
    "attachmentURL": null,
    "replyToId": null,
    "createdAt": "2026-01-13T05:30:00.000Z",
    "updatedAt": "2026-01-13T05:30:00.000Z",
    "isEdited": false,
    "isDeletedForEveryone": false,
    "isMine": true,
    "author": {
      "id": "778159b1-21c9-43cb-b495-87fcc8108692",
      "firstName": "Arslan",
      "lastName": "Mahesar",
      "email": "arslanxmahesar@gmail.com",
      "image": null
    },
    "room": {
      "id": "your-room-uuid-here",
      "title": "Room Title"
    }
  }
}
```

**You should also receive a broadcast:**
```json
{
  "event": "newMessage",
  "data": {
    // Same message object as above
  }
}
```

### Send Message with Attachment

**Send:**
```json
{
  "event": "sendMessage",
  "data": {
    "roomId": "your-room-uuid-here",
    "content": "Check out this file!",
    "attachmentURL": "https://example.com/files/document.pdf"
  }
}
```

### Reply to a Message

**Send:**
```json
{
  "event": "sendMessage",
  "data": {
    "roomId": "your-room-uuid-here",
    "content": "This is a reply!",
    "replyToId": "original-message-uuid"
  }
}
```

---

## Step 4: Update/Edit a Message

### Event: `updateMessage`

**Send:**
```json
{
  "event": "updateMessage",
  "data": {
    "messageId": "message-uuid-to-edit",
    "roomId": "your-room-uuid-here",
    "content": "Updated message content"
  }
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": {
    "id": "message-uuid-to-edit",
    "content": "Updated message content",
    "isEdited": true,
    // ... other fields
  }
}
```

**You should also receive a broadcast:**
```json
{
  "event": "messageUpdated",
  "data": {
    // Updated message object
  }
}
```

**Notes:**
- Only the message author can edit their messages
- Cannot edit messages deleted for everyone
- Backend may enforce time limits for editing

---

## Step 5: Delete For Me

Delete a message only for yourself (other room members still see it).

### Event: `deleteForMe`

**Send:**
```json
{
  "event": "deleteForMe",
  "data": {
    "messageId": "message-uuid-to-delete",
    "roomId": "your-room-uuid-here"
  }
}
```

**Expected Response:**
```json
{
  "success": true
}
```

**Notes:**
- Message remains visible to other room members
- No broadcast sent (personal deletion)
- You can delete any message in the room for yourself

---

## Step 6: Delete For Everyone

Delete a message for all room members.

### Event: `deleteForEveryone`

**Send:**
```json
{
  "event": "deleteForEveryone",
  "data": {
    "messageId": "message-uuid-to-delete",
    "roomId": "your-room-uuid-here"
  }
}
```

**Expected Response:**
```json
{
  "success": true
}
```

**You should also receive a broadcast:**
```json
{
  "event": "messageDeleted",
  "data": {
    "messageId": "message-uuid-to-delete",
    "deletedFor": "everyone",
    "roomId": "your-room-uuid-here",
    "authorId": "778159b1-21c9-43cb-b495-87fcc8108692"
  }
}
```

**Notes:**
- Only the message author can delete for everyone
- Backend enforces a 3-hour time limit
- All room members receive the broadcast

---

## Step 7: Leave a Room

### Event: `leaveRoom`

**Send:**
```json
{
  "event": "leaveRoom",
  "data": {
    "roomId": "your-room-uuid-here"
  }
}
```

**Expected Response:**
```json
{
  "success": true
}
```

**Server Logs:**
```
User 778159b1-21c9-43cb-b495-87fcc8108692 left room your-room-uuid-here
```

**Note:** After leaving, you won't receive new messages from this room.

---

## Listening to Events (Server → Client)

These are the events broadcasted by the server that you should listen for in Postman. In the **Messages** section of Postman, you'll see these incoming events.

### Event: `newMessage`

Received when anyone in the room sends a new message (including yourself for multi-device sync).

**Payload:**
```json
{
  "id": "message-uuid",
  "content": "Hello everyone in the room!",
  "attachmentURL": null,
  "replyToId": null,
  "createdAt": "2026-01-13T05:30:00.000Z",
  "updatedAt": "2026-01-13T05:30:00.000Z",
  "isEdited": false,
  "isDeletedForEveryone": false,
  "isMine": true,
  "author": {
    "id": "778159b1-21c9-43cb-b495-87fcc8108692",
    "firstName": "Arslan",
    "lastName": "Mahesar",
    "email": "arslanxmahesar@gmail.com",
    "image": null
  },
  "room": {
    "id": "room-uuid",
    "title": "Room Title"
  }
}
```

**When it's triggered:**
- When you or any room member sends a message
- All connected room members receive this event

---

### Event: `messageUpdated`

Received when a message is edited by its author.

**Payload:**
```json
{
  "id": "message-uuid",
  "content": "Updated message content",
  "attachmentURL": null,
  "replyToId": null,
  "createdAt": "2026-01-13T05:30:00.000Z",
  "updatedAt": "2026-01-13T05:35:00.000Z",
  "isEdited": true,
  "isDeletedForEveryone": false,
  "isMine": false,
  "author": {
    "id": "other-user-id",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "image": null
  },
  "room": {
    "id": "room-uuid",
    "title": "Room Title"
  }
}
```

**When it's triggered:**
- When any room member edits their message
- All connected room members receive this event
- Note the `isEdited: true` flag

---

### Event: `messageDeleted`

Received when a message is deleted for everyone.

**Payload:**
```json
{
  "messageId": "message-uuid-that-was-deleted",
  "deletedFor": "everyone",
  "roomId": "room-uuid",
  "authorId": "user-who-deleted-it"
}
```

**When it's triggered:**
- When the message author deletes their message for everyone
- All connected room members receive this event
- You should remove or hide this message in your UI

---

### Event: `error`

Received when an operation fails.

**Payload:**
```json
{
  "action": "sendMessage",
  "error": "Room not found",
  "messageId": "optional-message-id"
}
```

**When it's triggered:**
- When any WebSocket operation fails
- Only sent to the client who attempted the operation
- Contains the action that failed and error message

---

## How to Monitor Events in Postman

1. **After connecting**, keep the WebSocket connection open
2. **In the Messages panel**, you'll see:
   - **Outgoing messages** (green arrow ↑) - Events you send
   - **Incoming messages** (blue arrow ↓) - Events from server
3. **Join a room first** - You must join a room to receive broadcasts
4. **Open multiple tabs** - Test with 2+ connections to see real-time sync

### Example Message Flow:

```
↑ You send: {"event": "joinRoom", "data": {"roomId": "..."}}
↓ You receive: {"success": true}

↑ You send: {"event": "sendMessage", "data": {...}}
↓ You receive: {"success": true, "message": {...}}
↓ You receive: {"event": "newMessage", "data": {...}}  ← Broadcast

[Another user sends a message in the same room]
↓ You receive: {"event": "newMessage", "data": {...}}  ← You see it!

↑ You send: {"event": "updateMessage", "data": {...}}
↓ You receive: {"success": true, "message": {...}}
↓ You receive: {"event": "messageUpdated", "data": {...}}  ← Broadcast

↑ You send: {"event": "deleteForEveryone", "data": {...}}
↓ You receive: {"success": true}
↓ You receive: {"event": "messageDeleted", "data": {...}}  ← Broadcast
```

---

## Error Handling

### Common Errors

#### 1. Authentication Failed
**Error:**
```json
{
  "error": "Unauthorized"
}
```
**Solution:** Check your JWT token is valid and properly formatted.

#### 2. No Token Found
**Response:**
```json
{
  "success": false,
  "error": "Authentication token not found"
}
```
**Solution:** Ensure you're sending the token in headers or auth object.

#### 3. Room Not Found
**Error Event:**
```json
{
  "event": "error",
  "data": {
    "action": "sendMessage",
    "error": "Room not found"
  }
}
```
**Solution:** Verify the roomId exists in your database.

#### 4. Message Not Found
**Error:**
```json
{
  "success": false,
  "error": "Message not found"
}
```
**Solution:** Check the messageId is correct and the message exists.

#### 5. Permission Denied
**Error:**
```json
{
  "success": false,
  "error": "You can only edit your own messages"
}
```
**Solution:** You're trying to edit/delete someone else's message for everyone.

#### 6. Time Limit Exceeded
**Error:**
```json
{
  "success": false,
  "error": "Cannot delete for everyone after 3 hours. You can still delete for yourself."
}
```
**Solution:** Use `deleteForMe` instead.

---

## Testing Multi-User Scenarios

### Setup Two Connections

1. **Connection 1:** Login as User A, get token, connect to WebSocket
2. **Connection 2:** Login as User B, get token, connect to WebSocket (in new Postman tab)

### Test Scenario 1: Real-time Message Broadcasting

1. **Both connections:** Join the same room
2. **Connection 1:** Send a message
3. **Expected:** Both connections receive `newMessage` event

### Test Scenario 2: Edit Notifications

1. **Connection 1:** Send a message (note the message ID)
2. **Connection 1:** Edit that message
3. **Expected:** Both connections receive `messageUpdated` event

### Test Scenario 3: Delete For Everyone

1. **Connection 1:** Send a message
2. **Connection 1:** Delete for everyone
3. **Expected:** Both connections receive `messageDeleted` event

### Test Scenario 4: Delete For Me (Personal)

1. **Connection 1:** Send a message
2. **Connection 2:** Delete that message for themselves
3. **Expected:** Only Connection 2's view is affected, no broadcast

---

## Complete Test Flow Example

```json
// 1. Connect to ws://localhost:3001/general-chat
// Add header: Authorization: Bearer YOUR_TOKEN

// 2. Join Room
{
  "event": "joinRoom",
  "data": {
    "roomId": "d849414a-4576-4692-ad01-89ab4084d4bd"
  }
}

// Wait for response: {"success": true}

// 3. Send Message
{
  "event": "sendMessage",
  "data": {
    "roomId": "d849414a-4576-4692-ad01-89ab4084d4bd",
    "content": "Testing general chat!"
  }
}

// Note the message ID from response

// 4. Edit Message
{
  "event": "updateMessage",
  "data": {
    "messageId": "YOUR_MESSAGE_ID",
    "roomId": "d849414a-4576-4692-ad01-89ab4084d4bd",
    "content": "Updated: Testing general chat!"
  }
}

// 5. Delete For Everyone (within 3 hours)
{
  "event": "deleteForEveryone",
  "data": {
    "messageId": "YOUR_MESSAGE_ID",
    "roomId": "d849414a-4576-4692-ad01-89ab4084d4bd"
  }
}

// 6. Leave Room
{
  "event": "leaveRoom",
  "data": {
    "roomId": "d849414a-4576-4692-ad01-89ab4084d4bd"
  }
}

// 7. Disconnect
```

---

## Monitoring & Debugging

### Check Server Logs

Monitor your terminal for:
- Connection logs
- Event processing logs
- Error logs
- Redis pub/sub logs

### Check Redis

If you have redis-cli installed:
```bash
redis-cli
SUBSCRIBE general-chat
```

You'll see messages being published when events occur.

### Enable Debug Logging

In Postman:
1. Go to **View** → **Show Postman Console**
2. See detailed WebSocket communication logs

---

## REST API Endpoints for Loading Initial Data

Before or after WebSocket connection, use these to load messages:

### Get Room Messages
```
GET http://localhost:3000/general-chat?roomId=YOUR_ROOM_ID&page=1&limit=50
Authorization: Bearer YOUR_TOKEN
```

### Get Single Message
```
GET http://localhost:3000/general-chat/MESSAGE_ID?roomId=YOUR_ROOM_ID
Authorization: Bearer YOUR_TOKEN
```

---

## Tips & Best Practices

1. **Always join a room before sending messages** - Otherwise, you won't receive broadcasts from other users
2. **Keep the connection open** - WebSocket is persistent, don't disconnect/reconnect frequently
3. **Save message IDs** - You'll need them for edit/delete operations
4. **Test with multiple Postman tabs** - Open 2-3 connections to simulate multiple users
5. **Check both request and broadcast** - When you send a message, you get a response AND a broadcast
6. **Monitor server logs** - They show exactly what's happening on the backend
7. **Use valid UUIDs** - Room IDs and message IDs must be valid UUIDs from your database

---

## Troubleshooting Checklist

- [ ] Backend server is running on port 3000
- [ ] Communications server is running on port 3001
- [ ] Redis is running and accessible
- [ ] JWT token is valid (not expired)
- [ ] Token is properly formatted in headers (Bearer prefix)
- [ ] Room ID exists in database
- [ ] User is a member of the room (for backend API calls)
- [ ] Message IDs are correct and exist
- [ ] Using Postman Desktop (not web version)
- [ ] WebSocket URL uses `ws://` not `http://`

---

## Next Steps

After successful testing:
1. Implement typing indicators
2. Add read receipts
3. Implement online/offline status
4. Add file upload support
5. Create message reactions
6. Build the frontend integration

---

## Support

For issues:
- Check server console for errors
- Review backend API logs
- Verify database records
- Test REST endpoints first before WebSocket
- Compare with direct-chat implementation
