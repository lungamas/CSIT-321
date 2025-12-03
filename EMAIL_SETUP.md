# Password Reset Email Setup

The iMark platform now supports email-based password reset functionality. When users request a password reset, they will receive a secure link via email.

## How It Works

1. User enters their email on the forgot password page
2. System generates a secure token (valid for 1 hour)
3. Reset link is sent to user's email
4. User clicks the link and is automatically logged in
5. User can change their password in account settings

## Development Mode (No Email Configuration)

By default, the system works without email configuration:
- Reset links are logged to the console
- Links are also displayed on the forgot password page for testing
- Perfect for local development and testing

## Production Setup (Send Real Emails)

To enable actual email sending, configure these environment variables:

### 1. Create `.env` file in `/backend` directory

```bash
cp .env.example .env
```

### 2. Configure Email Settings

```env
# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@imark.com

# Application URL (change for production)
APP_URL=http://localhost:3000

# Server Port
PORT=3000
```

### 3. Gmail Setup (Recommended)

If using Gmail:

1. Enable 2-Factor Authentication on your Google Account
2. Generate an App Password:
   - Go to https://myaccount.google.com/security
   - Click "2-Step Verification"
   - Scroll down to "App passwords"
   - Select "Mail" and "Other (Custom name)"
   - Copy the generated 16-character password
3. Use this app password in `EMAIL_PASSWORD`

### 4. Other Email Services

You can use other services by changing `EMAIL_SERVICE`:
- `gmail` - Gmail
- `outlook` - Outlook.com
- `yahoo` - Yahoo Mail
- Or use custom SMTP settings (modify `emailService.js`)

## Testing the System

### Development Mode Test:
1. Go to http://localhost:3000/forgotpassword.html
2. Enter any registered user email
3. Check the server console for the reset link
4. Click the link shown on the page

### Production Mode Test:
1. Configure email settings in `.env`
2. Restart the server
3. Request password reset
4. Check your email inbox
5. Click the reset link

## Security Features

- ✅ Tokens are cryptographically secure (32 random bytes)
- ✅ Tokens expire after 1 hour
- ✅ One-time use only (token is cleared after use)
- ✅ Doesn't reveal if email exists (security best practice)
- ✅ Auto-login after reset for better UX
- ✅ Email/console fallback if email fails

## Email Template

The system sends a professional HTML email with:
- iMark branding
- Clear reset button
- Expiration warning
- Fallback plain text version
- Security notices

## Troubleshooting

**Email not sending?**
- Check your EMAIL_USER and EMAIL_PASSWORD in `.env`
- Verify Gmail App Password is correct
- Check server console for error messages
- System will fallback to console logging

**Link expired?**
- Links expire after 1 hour
- Request a new reset link

**Link already used?**
- Each link is one-time use only
- Request a new reset link if needed

## API Endpoints

### Request Password Reset
```
POST /api/auth/forgot-password
Body: { "email": "user@example.com" }
```

### Auto-Login (Token Validation)
```
GET /api/auth/auto-login?token=<reset-token>
```

## Files Modified/Created

- `backend/emailService.js` - Email sending logic
- `backend/.env.example` - Environment variables template
- `backend/server.js` - Integrated email service
- `backend/package.json` - Added nodemailer & dotenv

## Production Deployment

For production deployment:

1. Update `APP_URL` to your production domain
2. Use environment variables (not `.env` file)
3. Configure your email service properly
4. Test thoroughly before going live
5. Monitor email delivery rates

---

**Note:** The system gracefully falls back to console logging if email is not configured, making it perfect for development without requiring email setup.
