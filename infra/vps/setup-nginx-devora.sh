#!/usr/bin/env bash
set -e

DOMAIN="dev-ora.tn"
EMAIL="bejaouiahmed053@gmail.com"

rm -f /etc/nginx/sites-enabled/default

echo "Création du mot de passe Nginx pour qdrant et flower."
echo "Utilisateur: admin"
htpasswd -c /etc/nginx/.htpasswd admin

cat > /etc/nginx/sites-available/app.$DOMAIN <<EOF
server {
    listen 80;
    server_name app.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 300s;
        client_max_body_size 50M;
    }
}
EOF

cat > /etc/nginx/sites-available/api.$DOMAIN <<EOF
server {
    listen 80;
    server_name api.$DOMAIN;

    client_max_body_size 100M;

    location /metrics {
        deny all;
        return 403;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
EOF

cat > /etc/nginx/sites-available/yjs.$DOMAIN <<EOF
server {
    listen 80;
    server_name yjs.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:1234;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF

cat > /etc/nginx/sites-available/pgadmin.$DOMAIN <<EOF
server {
    listen 80;
    server_name pgadmin.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

cat > /etc/nginx/sites-available/qdrant.$DOMAIN <<EOF
server {
    listen 80;
    server_name qdrant.$DOMAIN;

    auth_basic "Acces Restreint";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:6333;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }
}
EOF

cat > /etc/nginx/sites-available/minio.$DOMAIN <<EOF
server {
    listen 80;
    server_name minio.$DOMAIN;

    ignore_invalid_headers off;
    client_max_body_size 0;
    proxy_buffering off;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        chunked_transfer_encoding on;
        proxy_connect_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF

cat > /etc/nginx/sites-available/storage.$DOMAIN <<EOF
server {
    listen 80;
    server_name storage.$DOMAIN;

    ignore_invalid_headers off;
    client_max_body_size 0;

    location / {
        proxy_pass http://127.0.0.1:9001;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

cat > /etc/nginx/sites-available/grafana.$DOMAIN <<EOF
server {
    listen 80;
    server_name grafana.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

cat > /etc/nginx/sites-available/flower.$DOMAIN <<EOF
server {
    listen 80;
    server_name flower.$DOMAIN;

    auth_basic "Acces Restreint";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:5555;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }
}
EOF

for sub in app api yjs pgadmin qdrant minio storage grafana flower; do
    ln -sf /etc/nginx/sites-available/${sub}.${DOMAIN} /etc/nginx/sites-enabled/${sub}.${DOMAIN}
    echo "Activé: ${sub}.${DOMAIN}"
done

nginx -t
systemctl reload nginx

certbot --nginx \
  -d app.$DOMAIN \
  -d api.$DOMAIN \
  -d yjs.$DOMAIN \
  -d pgadmin.$DOMAIN \
  -d qdrant.$DOMAIN \
  -d minio.$DOMAIN \
  -d storage.$DOMAIN \
  -d grafana.$DOMAIN \
  -d flower.$DOMAIN \
  --email $EMAIL \
  --agree-tos \
  --non-interactive \
  --redirect

certbot renew --dry-run

echo "Nginx + HTTPS terminés."
