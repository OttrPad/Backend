# OttrPad Backend Deployment Guide

Complete guide for deploying OttrPad Backend microservices to Digital Ocean with automatic GitHub deployments.

## 🏗️ Architecture

- **API Service (Gateway)** - Port 4000 - Entry point for all requests
- **Core Service** - Port 3001 - Business logic and data management
- **Collab Service** - Port 5002 - Real-time collaboration with Socket.IO
- **Exe Service** - Port 4004 - Code execution with Docker

## 📋 Prerequisites

- GitHub account with repository
- Digital Ocean account
- Domain name (optional but recommended)

## 🚀 Quick Start

### 1. Create Digital Ocean Droplet

```bash
# Option A: Via Web UI
# Go to https://cloud.digitalocean.com/
# Create > Droplets > Ubuntu 22.04 LTS
# Size: 4GB RAM, 2 vCPUs ($24/mo minimum recommended)

# Option B: Via CLI
doctl compute droplet create ottrpad-backend \
  --image ubuntu-22-04-x64 \
  --size s-2vcpu-4gb \
  --region nyc1 \
  --ssh-keys YOUR_SSH_KEY_ID
```

### 2. Initial Server Setup

```bash
# SSH into your droplet
ssh root@YOUR_DROPLET_IP

# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/Backend/main/scripts/setup-server.sh -o setup.sh
chmod +x setup.sh
sudo ./setup.sh
```

The setup script will:

- Install Docker & Docker Compose
- Install Nginx and SSL tools
- Configure firewall
- Clone your repository
- Setup environment files
- Configure reverse proxy

### 3. Configure Environment Variables

```bash
# Edit the .env file
nano /opt/ottrpad/.env
```

Required variables:

```env
JWT_SECRET=your-strong-secret-min-32-chars
GATEWAY_SECRET=your-strong-secret-min-32-chars
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key
GEMINI_API_KEY=your-key
```

### 4. Setup GitHub Actions for Auto-Deploy

#### A. Add GitHub Secrets

Go to your GitHub repository: **Settings > Secrets and variables > Actions**

Add these secrets:

| Secret Name                 | Description                   | Example                            |
| --------------------------- | ----------------------------- | ---------------------------------- |
| `DO_HOST`                   | Your droplet IP address       | `143.198.123.45`                   |
| `DO_USERNAME`               | SSH username (usually `root`) | `root`                             |
| `DO_SSH_KEY`                | Your private SSH key          | Contents of `~/.ssh/id_rsa`        |
| `DO_PORT`                   | SSH port (usually 22)         | `22`                               |
| `JWT_SECRET`                | JWT secret key                | `your-jwt-secret-min-32-chars`     |
| `GATEWAY_SECRET`            | Gateway auth secret           | `your-gateway-secret-min-32-chars` |
| `SUPABASE_URL`              | Supabase project URL          | `https://xxx.supabase.co`          |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key          | `eyJhbGc...`                       |
| `SUPABASE_ANON_KEY`         | Supabase anon key             | `eyJhbGc...`                       |
| `GEMINI_API_KEY`            | Google Gemini API key         | `AIza...`                          |

#### B. Generate SSH Key for GitHub Actions

```bash
# On your local machine
ssh-keygen -t rsa -b 4096 -C "github-actions" -f ~/.ssh/github-actions

# Copy the public key to your droplet
ssh-copy-id -i ~/.ssh/github-actions.pub root@YOUR_DROPLET_IP

# Copy the private key content for GitHub Secret
cat ~/.ssh/github-actions
# Copy this output to DO_SSH_KEY secret
```

### 5. Deploy

#### Option A: Push to GitHub (Auto-Deploy)

```bash
git add .
git commit -m "Deploy to production"
git push origin main
```

GitHub Actions will automatically deploy!

#### Option B: Manual Deploy on Server

```bash
ssh root@YOUR_DROPLET_IP
cd /opt/ottrpad
./scripts/deploy.sh
```

### 6. Setup Domain & SSL (Optional)

```bash
# The setup script will prompt for this, or run manually:

# Configure Nginx
sudo nano /etc/nginx/sites-available/ottrpad

# Get SSL certificate
sudo certbot --nginx -d api.yourdomain.com
```

## 📊 Monitoring & Management

### Check Service Status

```bash
# View all services
docker compose ps

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f api
docker compose logs -f core
docker compose logs -f collab
docker compose logs -f exe
```

### Health Checks

```bash
# API Gateway
curl http://localhost:4000/health

# Core Service
curl http://localhost:3001/status

# Collab Service
curl http://localhost:5002/health

# Exe Service
curl http://localhost:4004/health
```

### Common Operations

```bash
# Restart all services
docker compose restart

# Restart specific service
docker compose restart api

# Stop all services
docker compose down

# Start all services
docker compose up -d

# Rebuild and restart specific service
docker compose build api
docker compose up -d api

# View resource usage
docker stats

# Clean up old images
docker image prune -f
```

## 🔄 CI/CD Workflow

### Automatic Deployment Flow

1. **Push to main branch** → Triggers GitHub Actions
2. **GitHub Actions connects** to your droplet via SSH
3. **Pulls latest code** from repository
4. **Builds Docker images** for all services
5. **Restarts containers** with zero-downtime
6. **Runs health checks** to verify deployment
7. **Cleans up** old images
8. **Reports status** back to GitHub

### Manual Deployment

```bash
# SSH into server
ssh root@YOUR_DROPLET_IP

# Run deployment script
cd /opt/ottrpad
./scripts/deploy.sh
```

## 🐛 Troubleshooting

### Services won't start

```bash
# Check logs for errors
docker compose logs

# Check if ports are in use
sudo netstat -tulpn | grep -E '4000|3001|5002|4004'

# Restart Docker
sudo systemctl restart docker
docker compose up -d
```

### 502 Bad Gateway

```bash
# Check if services are running
docker compose ps

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Test backend directly
curl http://localhost:4000/health
```

### Out of Memory

```bash
# Check memory usage
free -h

# Add swap space
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### GitHub Actions Deployment Fails

```bash
# Check if server is reachable
ssh root@YOUR_DROPLET_IP

# Verify .env file exists
cat /opt/ottrpad/.env

# Check Docker is running
sudo systemctl status docker

# View GitHub Actions logs in your repository
# Go to: Actions tab > Click on failed workflow > View logs
```

### SSL Certificate Issues

```bash
# Test SSL certificate renewal
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal

# Check certificate status
sudo certbot certificates
```

## 📈 Scaling

### Vertical Scaling (Upgrade Droplet)

```bash
# Power off droplet
sudo shutdown -h now

# In Digital Ocean console:
# Droplet > Resize > Choose larger size > Resize

# Power on and verify
docker compose ps
```

### Horizontal Scaling (Load Balancer)

1. Create multiple droplets with same setup
2. Setup Digital Ocean Load Balancer
3. Point load balancer to all droplets
4. Update DNS to load balancer IP

## 💰 Cost Estimation

| Resource            | Specs            | Monthly Cost |
| ------------------- | ---------------- | ------------ |
| Basic Droplet       | 2 vCPU, 4GB RAM  | $24          |
| Recommended Droplet | 4 vCPU, 8GB RAM  | $48          |
| Production Droplet  | 8 vCPU, 16GB RAM | $96          |
| Load Balancer       | (optional)       | $12          |
| Spaces (backup)     | 250GB            | $5           |

**Recommended Setup: $48-60/month**

## 🔐 Security Best Practices

- ✅ Use SSH keys (not passwords)
- ✅ Enable UFW firewall
- ✅ Setup SSL certificates
- ✅ Use strong secrets (32+ characters)
- ✅ Regular security updates: `apt update && apt upgrade`
- ✅ Setup fail2ban: `apt install fail2ban`
- ✅ Regular backups
- ✅ Monitor logs for suspicious activity

## 📚 Additional Resources

- [Digital Ocean Documentation](https://docs.digitalocean.com/)
- [Docker Documentation](https://docs.docker.com/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Nginx Documentation](https://nginx.org/en/docs/)

## 🆘 Support

If you encounter issues:

1. Check logs: `docker compose logs -f`
2. Verify environment variables: `cat /opt/ottrpad/.env`
3. Check service health: `curl http://localhost:4000/health`
4. Review GitHub Actions logs in your repository
5. Check firewall: `sudo ufw status`

## 📝 Update Log

Keep track of deployments:

```bash
# View deployment history
cd /opt/ottrpad
git log --oneline -10

# View container restart times
docker compose ps
```
