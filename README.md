# Leave Management System

## Admin access

Configure admin setup on the server before starting the application:

- `ADMIN_SESSION_SECRET` — signing key with at least 32 characters
- `ADMIN_SETUP_KEY` — one-time first-admin setup key with at least 32 characters

For example, in PowerShell:

```powershell
$env:ADMIN_SESSION_SECRET = "replace-this-with-a-random-secret-at-least-32-characters"
$env:ADMIN_SETUP_KEY = "use-a-different-random-setup-key-at-least-32-characters"
npm start
```

Open the app and choose **Create First Admin**. Enter the setup key, username, email, password, department, and designation. The initial-admin setup link becomes unavailable after the first admin is created. Sign in with the username, email, and password. Signed-in admins can create additional department admin accounts from the dashboard.

If the setup link reports that admin setup is not configured, stop the server with `Ctrl+C`, set both environment variables in the same PowerShell terminal, and run `npm start` again. Refresh the browser page after the server restarts.

Admin passwords are stored as salted scrypt hashes. Keep setup/session keys private, use unique strong values, and serve the application over HTTPS outside local development. Admin sessions expire after eight hours and are held in browser memory.

Students submit leave requests with a reason; the request remains pending and does not change the balance until an admin approves it. Disapproved requests do not deduct leave. Admins can review requests, approve or disapprove them with an optional note, edit user details and leave balances, and delete user accounts. Users can review their request history and status.


use leave-management

// Student details, including leave requests
db.users.find().pretty()

// Admin details (omit password hash and salt)
db.admins.find({}, { passwordHash: 0, passwordSalt: 0 }).pretty()