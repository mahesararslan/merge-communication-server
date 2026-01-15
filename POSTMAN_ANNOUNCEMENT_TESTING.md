# Postman WebSocket Testing Guide - Announcements

This guide provides step-by-step instructions for testing the announcement WebSocket gateway using Postman Desktop.

## Prerequisites

- **Postman Desktop** (WebSocket support is not available in the web version)
- **Valid JWT Token** - Obtain from login endpoint
- **Room ID** - UUID of the room where announcements will be posted
- **Servers Running**:
  - Backend API: `http://localhost:3000`
  - Communications Server: `http://localhost:3001`
  - Redis Server: Running on default port

---

## Step 1: Connect to WebSocket Server

### Connection Setup
1. Open Postman Desktop
2. Create a **New WebSocket Request**
3. Enter the WebSocket URL:
   ```
   ws://localhost:3001/announcement
   ```
4. Add Authentication Header:
   - Click on **Headers** tab
   - Add header:
     - **Key**: `Authorization`
     - **Value**: `Bearer YOUR_JWT_TOKEN_HERE`
5. Click **Connect**

### Expected Response
You should see:
```
Connected to ws://localhost:3001/announcement
```

And in the server logs:
```
[AnnouncementGateway] Client {socket-id} connected for user {user-id}
```

---

## Step 2: Join a Room

Before receiving announcement broadcasts, clients must join a room.

### Event: `joinRoom`

**Send this event:**
```json
Event name: joinRoom

Message:
{
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0"
}
```

**Expected Response:**
```json
{
  "success": true
}
```

**Note:** Replace `roomId` with your actual room UUID.

---

## Step 3: Post Announcement (Admin/Moderator Only)

Create and publish a new announcement to the room.

### Event: `postAnnouncement`

**Send this event:**
```json
Event name: postAnnouncement

Message:
{
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0",
  "title": "Important Update",
  "content": "This is an important announcement for all members.",
  "isPublished": true
}
```

**Expected Response:**
```json
{
  "success": true,
  "announcement": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Important Update",
    "content": "This is an important announcement for all members.",
    "isPublished": true,
    "isEdited": false,
    "scheduledAt": null,
    "createdAt": "2026-01-15T10:30:00.000Z",
    "editedAt": "2026-01-15T10:30:00.000Z",
    "room": {
      "id": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0",
      "title": "My Room"
    },
    "author": {
      "id": "user-uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "image": null
    }
  }
}
```

**Broadcast Event (All Room Members Receive):**
```json
Event: newAnnouncement

Payload:
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "Important Update",
  "content": "This is an important announcement for all members.",
  "isPublished": true,
  "isEdited": false,
  "scheduledAt": null,
  "createdAt": "2026-01-15T10:30:00.000Z",
  "editedAt": "2026-01-15T10:30:00.000Z",
  "room": { ... },
  "author": { ... }
}
```

### Draft Announcements

To create a draft (unpublished) announcement:
```json
{
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0",
  "title": "Draft Announcement",
  "content": "This will be saved as a draft.",
  "isPublished": false
}
```

**Note:** Drafts won't trigger broadcasts until published.

---

## Step 4: Edit Announcement

Update an existing announcement (only the author can edit).

### Event: `editAnnouncement`

**Send this event:**
```json
Event name: editAnnouncement

Message:
{
  "announcementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0",
  "title": "Updated Title",
  "content": "Updated content with new information.",
  "isPublished": true
}
```

**Expected Response:**
```json
{
  "success": true,
  "announcement": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Updated Title",
    "content": "Updated content with new information.",
    "isPublished": true,
    "isEdited": true,
    "scheduledAt": null,
    "createdAt": "2026-01-15T10:30:00.000Z",
    "editedAt": "2026-01-15T10:35:00.000Z",
    "room": { ... },
    "author": { ... }
  }
}
```

**Broadcast Event (All Room Members Receive):**
```json
Event: announcementUpdated

Payload:
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "Updated Title",
  "content": "Updated content with new information.",
  "isEdited": true,
  ...
}
```

### Partial Updates

You can update only specific fields:
```json
{
  "announcementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0",
  "content": "Only updating the content"
}
```

---

## Step 5: Delete Announcement

Delete an announcement permanently (author or admin only).

### Event: `deleteAnnouncement`

**Send this event:**
```json
Event name: deleteAnnouncement

Message:
{
  "announcementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0"
}
```

**Expected Response:**
```json
{
  "success": true
}
```

**Broadcast Event (All Room Members Receive):**
```json
Event: announcementDeleted

Payload:
{
  "announcementId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0"
}
```

**Note:** This permanently deletes the announcement from the database.

---

## Step 6: Leave Room

Unsubscribe from announcement broadcasts for a specific room.

### Event: `leaveRoom`

**Send this event:**
```json
Event name: leaveRoom

Message:
{
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0"
}
```

**Expected Response:**
```json
{
  "success": true
}
```

After leaving, you won't receive announcement broadcasts for this room.

---

## Listening to Events (Server → Client)

Postman automatically displays incoming events in the **Messages** panel. Here's what to expect:

### 1. `newAnnouncement` Event
**Trigger:** When any admin/moderator posts an announcement or a scheduled announcement is published

**Payload:**
```json
{
  "id": "announcement-uuid",
  "title": "Announcement Title",
  "content": "Announcement content",
  "isPublished": true,
  "isEdited": false,
  "scheduledAt": null,
  "createdAt": "2026-01-15T10:30:00.000Z",
  "editedAt": "2026-01-15T10:30:00.000Z",
  "room": {
    "id": "room-uuid",
    "title": "Room Name"
  },
  "author": {
    "id": "user-uuid",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "image": null
  }
}
```

### 2. `announcementUpdated` Event
**Trigger:** When an announcement is edited

**Payload:**
```json
{
  "id": "announcement-uuid",
  "title": "Updated Title",
  "content": "Updated content",
  "isPublished": true,
  "isEdited": true,
  "scheduledAt": null,
  "createdAt": "2026-01-15T10:30:00.000Z",
  "editedAt": "2026-01-15T10:40:00.000Z",
  "room": { ... },
  "author": { ... }
}
```

### 3. `announcementDeleted` Event
**Trigger:** When an announcement is deleted

**Payload:**
```json
{
  "announcementId": "announcement-uuid",
  "roomId": "room-uuid"
}
```

### 4. `error` Event
**Trigger:** When an operation fails

**Payload:**
```json
{
  "action": "postAnnouncement",
  "error": "You don't have permission to post announcements",
  "announcementId": "announcement-uuid"
}
```

**Common Error Messages:**
- `"Unauthorized"` - Not authenticated
- `"You don't have permission to post announcements"` - Not admin/moderator
- `"Only the author can update this announcement"` - Trying to edit someone else's announcement
- `"Failed to post announcement"` - Backend API error

### Message Flow Visualization

```
↑ You send: postAnnouncement
↓ You receive: { success: true, announcement: {...} }
↓ All room members receive: newAnnouncement event

↑ You send: editAnnouncement
↓ You receive: { success: true, announcement: {...} }
↓ All room members receive: announcementUpdated event

↑ You send: deleteAnnouncement
↓ You receive: { success: true }
↓ All room members receive: announcementDeleted event
```

---

## Scheduled Announcements

Scheduled announcements are created via the REST API (not WebSocket), but they broadcast through WebSocket when published.

### Create Scheduled Announcement (REST API)

**Endpoint:** `POST http://localhost:3000/announcements/schedule`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0",
  "title": "Scheduled Maintenance",
  "content": "Server maintenance scheduled for tonight.",
  "scheduledAt": "2026-01-15T22:00:00.000Z"
}
```

**Response:**
```json
{
  "id": "scheduled-announcement-uuid",
  "title": "Scheduled Maintenance",
  "content": "Server maintenance scheduled for tonight.",
  "isPublished": false,
  "scheduledAt": "2026-01-15T22:00:00.000Z",
  "createdAt": "2026-01-15T10:00:00.000Z",
  ...
}
```

**What Happens:**
1. Announcement is saved with `isPublished: false`
2. BullMQ queues the announcement for the scheduled time
3. At `scheduledAt` time, backend publishes it
4. Backend calls `POST /internal/announcement-published` on communications server
5. Communications server broadcasts `newAnnouncement` to all room members

**WebSocket Event Received (at scheduled time):**
```json
Event: newAnnouncement

Payload:
{
  "id": "scheduled-announcement-uuid",
  "title": "Scheduled Maintenance",
  "content": "Server maintenance scheduled for tonight.",
  "isPublished": true,
  ...
}
```

---

## Multi-User Testing Scenario

Test real-time broadcasting with multiple users:

### Scenario: Admin Posts Announcement, Members Receive It

**Setup:**
1. Open 3 Postman windows/tabs
2. Connect all 3 to `ws://localhost:3001/announcement`
   - Window 1: Admin user (has posting permission)
   - Window 2: Regular member
   - Window 3: Regular member

**Test Steps:**

1. **All users join the same room:**
   ```json
   Event: joinRoom
   { "roomId": "same-room-id" }
   ```

2. **Admin (Window 1) posts announcement:**
   ```json
   Event: postAnnouncement
   {
     "roomId": "same-room-id",
     "title": "Team Meeting",
     "content": "Meeting at 3 PM today"
   }
   ```

3. **Expected Results:**
   - Window 1 (Admin): Receives acknowledgment + `newAnnouncement` broadcast
   - Window 2 (Member): Receives `newAnnouncement` broadcast
   - Window 3 (Member): Receives `newAnnouncement` broadcast

4. **Admin edits announcement:**
   ```json
   Event: editAnnouncement
   {
     "announcementId": "announcement-id",
     "roomId": "same-room-id",
     "content": "Meeting rescheduled to 4 PM"
   }
   ```

5. **Expected Results:**
   - All 3 windows receive `announcementUpdated` event

6. **Admin deletes announcement:**
   ```json
   Event: deleteAnnouncement
   {
     "announcementId": "announcement-id",
     "roomId": "same-room-id"
   }
   ```

7. **Expected Results:**
   - All 3 windows receive `announcementDeleted` event

---

## Permissions Testing

Test role-based access control:

### Test 1: Regular Member Tries to Post
**User:** Regular member (not admin/moderator)

```json
Event: postAnnouncement
{
  "roomId": "room-id",
  "title": "Test",
  "content": "Should fail"
}
```

**Expected Result:**
```json
{
  "success": false,
  "error": "You don't have permission to post announcements"
}
```

### Test 2: Non-Author Tries to Edit
**User:** Different admin/moderator (not the author)

```json
Event: editAnnouncement
{
  "announcementId": "someone-elses-announcement",
  "roomId": "room-id",
  "title": "Trying to edit"
}
```

**Expected Result:**
```json
{
  "success": false,
  "error": "Only the author can update this announcement"
}
```

### Test 3: Admin Can Delete Anyone's Announcement
**User:** Room admin

```json
Event: deleteAnnouncement
{
  "announcementId": "any-announcement-id",
  "roomId": "room-id"
}
```

**Expected Result:**
```json
{
  "success": true
}
```

---

## REST API Endpoints (For Reference)

Use these to set up test data or verify WebSocket results:

### Get All Announcements
```
GET http://localhost:3000/announcements?roomId=YOUR_ROOM_ID
Authorization: Bearer YOUR_JWT_TOKEN
```

Query Parameters:
- `page` (default: 1)
- `limit` (default: 20)
- `sortBy` (default: createdAt)
- `sortOrder` (ASC/DESC, default: DESC)
- `filter` (all/published/scheduled/draft, default: all)

### Get Single Announcement
```
GET http://localhost:3000/announcements/:id?roomId=YOUR_ROOM_ID
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Troubleshooting Checklist

### Connection Issues
- [ ] Using **Postman Desktop** (not web version)
- [ ] WebSocket URL is correct: `ws://localhost:3001/announcement`
- [ ] Authorization header is set with valid JWT token
- [ ] Communications server is running on port 3001
- [ ] Check server logs for connection messages

### Not Receiving Broadcasts
- [ ] Called `joinRoom` event first with correct `roomId`
- [ ] Check if you're in the correct room
- [ ] Verify other users are in the same room
- [ ] Check Redis is running and connected
- [ ] Look for errors in server logs

### Permission Errors
- [ ] User has admin or moderator role in the room
- [ ] JWT token is valid and not expired
- [ ] RoomId is correct in the request
- [ ] Check backend logs for authorization failures

### Scheduled Announcements Not Broadcasting
- [ ] BullMQ/Redis is running
- [ ] Backend announcement processor is running
- [ ] `COMMUNICATIONS_SERVER_URL` is set in backend `.env`
- [ ] Check backend logs for scheduling errors
- [ ] Verify `scheduledAt` time is in the future

### Event Not Triggering
- [ ] Event name is correct (case-sensitive)
- [ ] JSON payload is valid
- [ ] All required fields are present
- [ ] Room ID is a valid UUID
- [ ] Check Postman console for errors

---

## Complete Test Flow Example

Here's a complete test sequence:

```json
// 1. Connect to ws://localhost:3001/announcement
// (with Authorization header)

// 2. Join room
Event: joinRoom
{ "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0" }

// 3. Post announcement
Event: postAnnouncement
{
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0",
  "title": "Welcome",
  "content": "Welcome to the course!",
  "isPublished": true
}

// 4. Wait for newAnnouncement broadcast
// All room members receive it

// 5. Edit the announcement
Event: editAnnouncement
{
  "announcementId": "announcement-id-from-step-3",
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0",
  "content": "Welcome to the course! First class on Monday."
}

// 6. Wait for announcementUpdated broadcast

// 7. Delete the announcement
Event: deleteAnnouncement
{
  "announcementId": "announcement-id-from-step-3",
  "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0"
}

// 8. Wait for announcementDeleted broadcast

// 9. Leave room
Event: leaveRoom
{ "roomId": "226e27fc-01eb-4a2a-97ad-a0c3fdaf56f0" }

// 10. Disconnect
```

---

## Notes

- **Announcements are room-specific**: Always include `roomId`
- **Only admin/moderator can post**: Backend validates permissions
- **Only author can edit**: But admin can delete anyone's announcements
- **Deletions are permanent**: No soft delete for announcements
- **Scheduled announcements**: Created via REST API, broadcasted via WebSocket
- **Real-time sync**: All operations broadcast to all room members
- **isEdited flag**: Automatically set to `true` when announcement is updated

---

## Advanced Testing

### Load Testing
Test with multiple concurrent connections and rapid announcement posting.

### Reconnection Testing
1. Connect and join room
2. Disconnect
3. Reconnect with same token
4. Rejoin room
5. Verify you receive broadcasts

### Cross-Instance Testing
1. Run multiple communications server instances
2. Connect clients to different instances
3. Post announcement from one instance
4. Verify Redis pub/sub distributes to all instances
5. All clients receive the broadcast

---

## Summary

This WebSocket gateway provides real-time announcement broadcasting for room-based communication. Admins and moderators can post, edit, and delete announcements, while all room members receive instant updates. Scheduled announcements are created via REST API and automatically broadcast at the specified time.

For frontend integration, refer to `WEBSOCKET_FRONTEND_GUIDE.md`.
