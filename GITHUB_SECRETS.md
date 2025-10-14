# GitHub Secrets Configuration Guide

This document lists all the secrets you need to add to your GitHub repository for automatic deployment.

## 📍 Where to Add Secrets

1. Go to your GitHub repository: `https://github.com/YOUR_USERNAME/Backend`
2. Click **Settings** (top menu)
3. In left sidebar: **Secrets and variables** → **Actions**
4. Click **New repository secret** for each secret below

---

## 🔐 Required GitHub Secrets

### Server Connection Secrets

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `DO_HOST` | Digital Ocean droplet IP address | From Digital Ocean dashboard |
| `DO_USERNAME` | SSH username (usually `root`) | `root` |
| `DO_SSH_KEY` | Private SSH key content | See "Generate SSH Key" section below |
| `DO_PORT` | SSH port (optional, defaults to 22) | `22` |

### Application Secrets

| Secret Name | Value from Your .env | Example |
|------------|---------------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | `https://agmtvkietedgnlrzzidr.supabase.co` |
| `SUPABASE_KEY` | Your Supabase anon key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_JWT_SECRET` | Your Supabase JWT secret | `M4qmCH8Aq3PoIfusUIYMqyE5kqguzumI...` |
| `GATEWAY_SECRET` | Your gateway shared secret | `540af96a74ce2d3fef343532003ca2fd` |
| `GEMINI_API_KEY` | Your Google Gemini API key | `AIzaSyCGipbTO2XD0EGgI_AiDbxt0x7i26WeFdE` |
| `FRONTEND_URL` | Your frontend URL (optional) | `https://yourdomain.com` |

---

## 🔑 Generate SSH Key for GitHub Actions

Run these commands on your **local machine**:

```powershell
# Generate SSH key pair
ssh-keygen -t rsa -b 4096 -C "github-actions-ottrpad" -f $env:USERPROFILE\.ssh\github-actions-ottrpad

# This creates two files:
# - github-actions-ottrpad (private key) → for GitHub Secret
# - github-actions-ottrpad.pub (public key) → for your server
```

### Get the Private Key (for GitHub Secret: `DO_SSH_KEY`)

```powershell
# Display private key
Get-Content $env:USERPROFILE\.ssh\github-actions-ottrpad

# Copy the ENTIRE output including:
# -----BEGIN OPENSSH PRIVATE KEY-----
# (all the lines)
# -----END OPENSSH PRIVATE KEY-----
```

### Get the Public Key (to add to your server)

```powershell
# Display public key
Get-Content $env:USERPROFILE\.ssh\github-actions-ottrpad.pub
```

---

## 🖥️ Add Public Key to Your Server

Once you have your Digital Ocean droplet, add the public key:

```bash
# SSH into your server
ssh root@YOUR_DROPLET_IP

# Add public key to authorized_keys
mkdir -p ~/.ssh
echo "YOUR_PUBLIC_KEY_CONTENT_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

Or use `ssh-copy-id`:

```powershell
# From your local machine
ssh-copy-id -i $env:USERPROFILE\.ssh\github-actions-ottrpad.pub root@YOUR_DROPLET_IP
```

---

## ✅ Verify Configuration

After adding all secrets:

1. Go to **Actions** tab in your GitHub repository
2. Make a small change and push to `main` branch:
   ```powershell
   echo "# Test deployment" >> README.md
   git add README.md
   git commit -m "Test: Trigger deployment"
   git push origin main
   ```
3. Watch the workflow run in the Actions tab
4. If it fails, check the logs for which secret might be missing or incorrect

---

## 🔒 Security Best Practices

- ✅ Never commit `.env` file to Git (it's in `.gitignore`)
- ✅ Use different secrets for development and production
- ✅ Rotate secrets periodically (every 90 days)
- ✅ Use strong, random secrets (32+ characters)
- ✅ Limit SSH access to specific IPs if possible
- ✅ Enable 2FA on GitHub and Digital Ocean accounts

---

## 🆘 Troubleshooting

### "Permission denied (publickey)" Error

**Problem:** SSH key not added to server or wrong key in GitHub Secret

**Solution:**
```bash
# On server, check authorized_keys
cat ~/.ssh/authorized_keys

# Make sure your public key is there
# Check permissions
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### "Host key verification failed" Error

**Problem:** First time connecting to server

**Solution:**
```bash
# On your local machine, connect once manually to accept host key
ssh -i $env:USERPROFILE\.ssh\github-actions-ottrpad root@YOUR_DROPLET_IP

# Type "yes" when prompted
```

### Secrets Not Working

**Problem:** Wrong secret name or value

**Solution:**
1. Double-check secret names match exactly (case-sensitive)
2. Make sure there are no extra spaces or newlines
3. Re-enter the secret value
4. Test SSH connection manually:
   ```powershell
   ssh -i $env:USERPROFILE\.ssh\github-actions-ottrpad root@YOUR_DROPLET_IP
   ```

---

## 📋 Quick Checklist

Before deploying, make sure you have:

- [ ] Added all 10 secrets to GitHub
- [ ] Generated SSH key pair
- [ ] Added public key to server
- [ ] Tested SSH connection manually
- [ ] Verified Supabase credentials
- [ ] Verified Gemini API key
- [ ] Created Digital Ocean droplet
- [ ] Noted droplet IP address

---

## 🔄 When to Update Secrets

Update GitHub Secrets when:
- You rotate API keys
- You change Supabase project
- You move to a new server (update IP and SSH key)
- You regenerate authentication secrets
- You get a new Gemini API key

Remember: After updating secrets, you may need to trigger a new deployment or manually update `.env` on the server.
