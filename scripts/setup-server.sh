#!/bin/bash
set -e

echo "🔧 Setting up OttrPad Backend Server on Digital Ocean..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root or with sudo"
    exit 1
fi

# Update system
print_status "📦 Updating system packages..."
apt update && apt upgrade -y

# Install Docker
print_status "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
else
    print_status "Docker already installed"
fi

# Install Docker Compose
print_status "📦 Installing Docker Compose..."
if ! docker compose version &> /dev/null; then
    apt install docker-compose-plugin -y
else
    print_status "Docker Compose already installed"
fi

# Install additional tools
print_status "🛠️  Installing additional tools..."
apt install -y git nginx certbot python3-certbot-nginx ufw htop curl wget

# Configure Docker logging
print_status "📝 Configuring Docker logging..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

systemctl restart docker

# Setup firewall
print_status "🔥 Configuring firewall..."
ufw --force enable
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw status

# Create application directory
print_status "📁 Creating application directory..."
mkdir -p /opt/ottrpad
cd /opt/ottrpad

# Setup GitHub repository
print_status "📥 Setting up GitHub repository..."
echo ""
echo "Please enter your GitHub repository URL (e.g., https://github.com/username/Backend.git):"
read -r REPO_URL

if [ -z "$REPO_URL" ]; then
    print_error "Repository URL is required"
    exit 1
fi

# Clone repository
if [ -d ".git" ]; then
    print_status "Repository already exists, pulling latest changes..."
    git pull
else
    print_status "Cloning repository..."
    git clone "$REPO_URL" .
fi

# Setup environment file
print_status "⚙️  Setting up environment variables..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANT: Please edit /opt/ottrpad/.env with your actual values:"
    echo "   nano /opt/ottrpad/.env"
    echo ""
else
    print_status ".env file already exists"
fi

# Setup deploy script permissions
print_status "🔐 Setting up script permissions..."
chmod +x scripts/deploy.sh

# Configure Nginx
print_status "🌐 Configuring Nginx..."
echo ""
echo "Do you want to configure Nginx reverse proxy? (y/n)"
read -r CONFIGURE_NGINX

if [ "$CONFIGURE_NGINX" = "y" ]; then
    echo "Enter your domain name (e.g., api.yourdomain.com):"
    read -r DOMAIN_NAME
    
    if [ -z "$DOMAIN_NAME" ]; then
        print_error "Domain name is required"
        exit 1
    fi
    
    rm -f /etc/nginx/sites-enabled/default
    
    cat > /etc/nginx/sites-available/ottrpad <<EOF
upstream api_backend {
    server localhost:4000;
}

upstream collab_backend {
    server localhost:5002;
}

server {
    listen 80;
    server_name $DOMAIN_NAME;

    client_max_body_size 10M;

    location / {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://collab_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
EOF
    
    ln -sf /etc/nginx/sites-available/ottrpad /etc/nginx/sites-enabled/
    nginx -t
    systemctl reload nginx
    
    print_status "Nginx configured successfully"
    
    # Setup SSL
    echo ""
    echo "Do you want to setup SSL certificate with Let's Encrypt? (y/n)"
    read -r SETUP_SSL
    
    if [ "$SETUP_SSL" = "y" ]; then
        echo "Enter your email for SSL certificate notifications:"
        read -r EMAIL
        
        if [ -z "$EMAIL" ]; then
            print_error "Email is required for SSL certificate"
        else
            certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos --email "$EMAIL" --redirect
            print_status "SSL certificate installed successfully"
        fi
    fi
fi

# Create systemd service for auto-restart
print_status "⚙️  Creating systemd service..."
cat > /etc/systemd/system/ottrpad.service <<EOF
[Unit]
Description=OttrPad Backend Services
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/ottrpad
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ottrpad.service

# Setup GitHub webhook deployment (optional)
print_status "🔗 GitHub webhook setup..."
echo ""
echo "To enable automatic deployments from GitHub:"
echo "1. Go to your GitHub repository Settings > Webhooks"
echo "2. Add webhook with:"
echo "   Payload URL: http://YOUR_SERVER_IP:9000/hooks/deploy"
echo "   Content type: application/json"
echo "   Secret: (generate a strong secret)"
echo "3. Install webhook listener: apt install webhook"
echo "4. Configure webhook to run /opt/ottrpad/scripts/deploy.sh"
echo ""

# Final instructions
echo ""
print_status "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit environment variables: nano /opt/ottrpad/.env"
echo "2. Run initial deployment: cd /opt/ottrpad && ./scripts/deploy.sh"
echo "3. Check service status: docker compose ps"
echo "4. View logs: docker compose logs -f"
echo ""
echo "Useful commands:"
echo "  Deploy: cd /opt/ottrpad && ./scripts/deploy.sh"
echo "  Logs: docker compose logs -f"
echo "  Status: docker compose ps"
echo "  Restart: docker compose restart"
echo ""
