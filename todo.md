# MyNotes TODO

## Authentication & Security
- [x] User authentication with session management
- [x] Two-factor authentication (2FA) setup and verification
- [x] Client-side encryption key derivation using PBKDF2
- [x] AES-256-GCM encryption/decryption module
- [x] Secure key storage in browser memory

## Database Schema
- [x] Notes table with encrypted content and metadata
- [x] Tags table for note organization
- [x] Folders table with nested structure support
- [x] Note-tag relationships table
- [x] Note-folder relationships table
- [x] Revisions table for version history
- [x] User settings table for preferences

## Note Types & Editors
- [x] Plain text editor
- [ ] Rich text editor with formatting toolbar
- [ ] Markdown editor with preview
- [ ] Checklist/to-do list editor with interactive checkboxes
- [ ] Code snippet editor with syntax highlighting
- [ ] Spreadsheet editor for basic calculations

## Organization Features
- [x] Tag creation and management
- [x] Nested folder structure with drag-and-drop
- [x] Note pinning functionality
- [x] Note archiving functionality
- [x] Trash bin with recovery option
- [x] Permanent delete functionality

## Search & Filtering
- [x] Full-text search across all notes (title-based)
- [ ] Search by tags
- [ ] Smart views with custom queries
- [ ] Filter by creation date
- [ ] Filter by modification date
- [ ] Filter by note type
- [ ] Filter by tags and folders

## Revision History
- [x] Automatic revision creation on note updates
- [x] View previous versions of notes
- [ ] Restore notes to previous versions
- [ ] Compare revisions side-by-side

## Offline & Sync
- [x] IndexedDB setup for local storage
- [x] Offline note creation and editing
- [x] Sync queue for pending changes
- [x] Conflict resolution strategy (last-write-wins)
- [ ] Real-time WebSocket connection
- [ ] Automatic sync when online
- [ ] Sync status indicators

## UI/UX
- [x] Dashboard layout with sidebar navigation
- [x] Note list view with previews
- [x] Note editor interface
- [ ] Folder tree view
- [ ] Tag management interface
- [ ] Settings page
- [x] Loading states and skeletons
- [x] Error handling and user feedback
- [ ] Responsive design for mobile/tablet

## Testing & Deployment
- [ ] Write unit tests for encryption module
- [ ] Write unit tests for sync engine
- [ ] Write API tests for backend endpoints
- [ ] Test offline functionality
- [ ] Test real-time sync across devices
- [ ] Create deployment checkpoint

## Bug Fixes
- [x] Fix atob decryption error for notes with non-Base64 / plain-text content
- [x] Fix logout not working on Dashboard

## Local Authentication (Self-Hosted)
- [x] Add password hash column to users table
- [x] Build register endpoint (email + password)
- [x] Build login endpoint with bcrypt verify + JWT session
- [x] Build logout endpoint (clear cookie)
- [x] Build /me endpoint for session check
- [x] Create Login page
- [x] Create Register page
- [x] Remove Manus OAuth dependency from app flow
- [x] Protect all existing routes with local auth guard
