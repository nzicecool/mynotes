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

## Note Type Editors (Visible & Functional)
- [x] Add prominent note type selector when creating/editing notes
- [x] Plain text editor (textarea)
- [x] Rich text editor with formatting toolbar (TipTap)
- [x] Markdown editor with split-pane live preview
- [x] Checklist editor with interactive checkboxes and add/remove items
- [x] Code snippet editor with syntax highlighting and language selector
- [x] Spreadsheet editor with basic row/column grid

## Bug Fixes
- [x] Fix nested button error in Dashboard sidebar note list

## Password Reset Flow
- [x] Add passwordResetTokens table to database schema
- [x] Add db helpers: createResetToken, getResetToken, deleteResetToken
- [x] Build POST /api/auth/forgot-password endpoint (generate token, send/log link)
- [x] Build POST /api/auth/reset-password endpoint (verify token, update password)
- [x] Build Forgot Password page (/forgot-password)
- [x] Build Reset Password page (/reset-password?token=...)
- [x] Add "Forgot password?" link to Login page
- [x] Optional SMTP email dispatch with nodemailer
- [x] Admin console log fallback for local deployments without SMTP

## Documentation
- [x] Write README.md with local setup, environment variables, SMTP config, and contribution guide
- [x] Add MIT LICENSE file

## Agentmail.to Integration
- [x] Read Agentmail skill and configure API
- [x] Replace/supplement nodemailer with Agentmail.to for password reset emails (primary provider)
- [x] Add AGENTMAIL_API_KEY, AGENTMAIL_INBOX_ID, AGENTMAIL_INBOX_USERNAME environment variables
- [x] Write vitest tests for AgentMail service

## Docker & Deployment
- [x] Create multi-arch Dockerfile (amd64, arm64, arm/v7 for Raspberry Pi 3B)
- [x] Create .dockerignore
- [x] Create docker-compose.yml with MySQL and app services
- [x] Create k3s Kubernetes manifests (namespace, secrets, mysql StatefulSet, app Deployment, Traefik Ingress)
- [x] Create deploy/k3s/README.md with full k3s deployment guide
- [x] Update README.md with all deployment options (Docker Compose, Pi 3B standalone, k3s)

## SQLite Dual-Driver Support
- [ ] Install better-sqlite3 and @types/better-sqlite3
- [ ] Create drizzle/schema.sqlite.ts with SQLite-compatible schema
- [ ] Update db.ts to initialise either SQLite or MySQL based on DATABASE_DRIVER env var
- [ ] Update db:push script to support both drivers
- [ ] Create docker-compose.pi.yml (single container, SQLite, ARM32v7)
- [ ] Update Dockerfile to include SQLite build dependencies
- [ ] Update README.md with SQLite setup instructions
- [ ] Update deploy/k3s/README.md with SQLite option for Pi
- [ ] Write vitest tests for SQLite driver path
