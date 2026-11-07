#!/usr/bin/env bash
# One-shot installer for an Oracle Cloud (OCI) Compute VM running Oracle Linux 8/9 or Ubuntu 22.04/24.04.
# Usage (from the unzipped project folder):   sudo bash deploy/setup-oci.sh [--nginx]
#   --nginx : also install nginx and proxy port 80 -> app (recommended; then add HTTPS with certbot)
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo"; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
USE_NGINX=0; [ "${1:-}" = "--nginx" ] && USE_NGINX=1
APP_PORT=8080

echo "==> Installing Node.js 20"
if command -v dnf >/dev/null 2>&1; then
  dnf -y module reset nodejs >/dev/null 2>&1 || true
  dnf -y module enable nodejs:20 >/dev/null 2>&1 || true
  dnf -y install nodejs
  [ $USE_NGINX -eq 1 ] && dnf -y install nginx
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  [ $USE_NGINX -eq 1 ] && apt-get install -y nginx
else echo "Unsupported OS"; exit 1; fi
NODE_BIN="$(command -v node)"; echo "Node: $($NODE_BIN -v)"

echo "==> Copying app to /opt/lifeos"
id lifeos >/dev/null 2>&1 || useradd --system --home /opt/lifeos --shell /usr/sbin/nologin lifeos
mkdir -p /opt/lifeos /var/lib/lifeos
cp -r "$SRC/server.js" "$SRC/package.json" "$SRC/lib" "$SRC/public" /opt/lifeos/
chown -R root:root /opt/lifeos; chown -R lifeos:lifeos /var/lib/lifeos

if [ ! -f /etc/lifeos.env ]; then
  PW="${APP_PASSWORD:-$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)}"
  cat > /etc/lifeos.env <<ENV
PORT=$APP_PORT
HOST=$([ $USE_NGINX -eq 1 ] && echo 127.0.0.1 || echo 0.0.0.0)
APP_USER=admin
APP_PASSWORD=$PW
DATA_DIR=/var/lib/lifeos
ENV
  chmod 600 /etc/lifeos.env
  echo "==> Created /etc/lifeos.env  (login: admin / $PW)  <- save this password!"
fi

echo "==> Installing systemd service"
sed "s|__NODE__|$NODE_BIN|" "$SRC/deploy/lifeos.service" > /etc/systemd/system/lifeos.service
systemctl daemon-reload; systemctl enable --now lifeos

echo "==> Opening the OS firewall (the OCI Security List / NSG must ALSO allow the port)"
OPEN_PORT=$APP_PORT; [ $USE_NGINX -eq 1 ] && OPEN_PORT=80
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-port=${OPEN_PORT}/tcp; [ $USE_NGINX -eq 1 ] && firewall-cmd --permanent --add-port=443/tcp; firewall-cmd --reload
elif command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport $OPEN_PORT -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport $OPEN_PORT -j ACCEPT
  [ $USE_NGINX -eq 1 ] && { iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT; }
  command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save || { apt-get install -y iptables-persistent >/dev/null 2>&1 && netfilter-persistent save || true; }
fi

if [ $USE_NGINX -eq 1 ]; then
  echo "==> Configuring nginx"
  CONF_DIR=/etc/nginx/conf.d; mkdir -p $CONF_DIR
  cp "$SRC/deploy/nginx-lifeos.conf" $CONF_DIR/lifeos.conf
  sed -i 's/server_name example.com;/server_name _;/' $CONF_DIR/lifeos.conf
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  command -v setsebool >/dev/null 2>&1 && setsebool -P httpd_can_network_connect 1 || true
  nginx -t && systemctl enable --now nginx && systemctl reload nginx
fi

IP="$(curl -s -m 3 ifconfig.me || echo '<public-ip>')"
echo; echo "Done. Open http://$IP$([ $USE_NGINX -eq 1 ] || echo :$APP_PORT)  (health: /healthz)"
echo "Logs: journalctl -u lifeos -f      Backup: /var/lib/lifeos/db.json"
