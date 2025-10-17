#!/bin/bash
set -e

echo "🚀 Starting OttrPad Backend Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root or with sudo"
    exit 1
fi

# Navigate to app directory
cd /opt/ottrpad || exit 1

# Backup current state
print_status "💾 Creating backup..."
mkdir -p backups
docker compose logs > "backups/logs_backup_$(date +%Y%m%d_%H%M%S).txt" 2>&1 || true

# Pull latest code
print_status "📥 Pulling latest code from GitHub..."
git fetch origin
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git reset --hard origin/$CURRENT_BRANCH

# Check if .env exists
if [ ! -f .env ]; then
    print_error ".env file not found! Please create it from .env.example"
    exit 1
fi

# Build services
print_status "🔨 Building Docker images..."
docker compose build --no-cache

# Stop current containers
print_status "🛑 Stopping current containers..."
docker compose down

# Start new containers
print_status "🚀 Starting new containers..."
docker compose up -d

# Wait for services to be ready
print_status "⏳ Waiting for services to start..."
sleep 15

# Health check function
check_health() {
    local service=$1
    local url=$2
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f $url > /dev/null 2>&1; then
            print_status "✅ $service is healthy"
            return 0
        fi
        print_warning "Waiting for $service (attempt $attempt/$max_attempts)..."
        sleep 3
        attempt=$((attempt + 1))
    done
    
    print_error "$service health check failed"
    return 1
}

# Run health checks
print_status "🏥 Running health checks..."
check_health "API Gateway" "http://localhost:4000/health"
check_health "Core Service" "http://localhost:3001/status"
check_health "Collab Service" "http://localhost:5002/health"
check_health "Exe Service" "http://localhost:4004/health"

# Show running containers
print_status "📊 Running containers:"
docker compose ps

# Clean up old images
print_status "🧹 Cleaning up old images..."
docker image prune -f

# Show final status
echo ""
print_status "✅ Deployment complete!"
echo ""
echo "Service URLs:"
echo "  API Gateway:  http://localhost:4000"
echo "  Core Service: http://localhost:3001"
echo "  Collab:       http://localhost:5002"
echo "  Exe:          http://localhost:4004"
echo ""
echo "Logs: docker compose logs -f"
echo ""
