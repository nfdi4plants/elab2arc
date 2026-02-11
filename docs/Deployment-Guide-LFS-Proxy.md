# LFS CORS Proxy Deployment Guide

## Quick Summary

The LFS CORS proxy is **created and tested** but needs to be **properly deployed** on the server with SSL. Current state:
- ✅ Proxy code created and tested (runs on port 8083)
- ✅ elab2arc updated to use `https://lfsproxy.cplantbox.com`
- ❌ Not configured as systemd service
- ❌ Not configured with nginx SSL
- ❌ DNS not configured for `lfsproxy.cplantbox.com`

## Deployment Steps (SSH to small)

### Step 1: Copy files to system location

```bash
ssh small

# Create directory and copy files
sudo mkdir -p /usr/local/lib/lfs-cors-proxy
sudo cp ~/lfs-cors-proxy/server.js /usr/local/lib/lfs-cors-proxy/
sudo chown -R root:root /usr/local/lib/lfs-cors-proxy
sudo chmod 644 /usr/local/lib/lfs-cors-proxy/server.js
```

### Step 2: Create systemd service

```bash
sudo tee /etc/systemd/system/lfs-cors.service << 'EOF'
[Unit]
Description=LFS CORS Proxy for GitLab LFS uploads
After=network-online.target

[Service]
Type=simple
User=root
Group=root
Restart=on-failure
RestartSec=10
WorkingDirectory=/usr/local/lib/lfs-cors-proxy
ExecStart=/usr/bin/node server.js
Environment="NODE_ENV=production"
Environment="PORT=8083"
Environment="HOST=0.0.0.0"

[Install]
WantedBy=multi-user.target
EOF
```

### Step 3: Enable and start service

```bash
sudo systemctl daemon-reload
sudo systemctl enable lfs-cors.service
sudo systemctl start lfs-cors.service
sudo systemctl status lfs-cors.service
```

### Step 4: Configure nginx with SSL

```bash
sudo tee /etc/nginx/sites-available/lfsproxy.cplantbox.com << 'EOF'
server {
    client_max_body_size 1000M;
    client_body_timeout 300s;
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    ssl_certificate         /etc/ssl/cert.pem;
    ssl_certificate_key     /etc/ssl/key.pem;

    server_name lfsproxy.cplantbox.com;
    merge_slashes off;

    location / {
        proxy_pass http://localhost:8083/;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/lfsproxy.cplantbox.com /etc/nginx/sites-enabled/

# Test and reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

### Step 5: Configure DNS (if needed)

Add DNS record for `lfsproxy.cplantbox.com` pointing to your server IP.

### Step 6: Test the proxy

```bash
# Test OPTIONS preflight
curl -v -X OPTIONS \
  -H "Origin: http://localhost:8000" \
  -H "Access-Control-Request-Method: PUT" \
  https://lfsproxy.cplantbox.com/https://git.nfdi4plants.org/

# Expected: 204 with Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS
```

## Testing in elab2arc

Once deployed:

1. Open elab2arc in browser
2. Select experiment 62 (LFS large file test)
3. Select INV018_RibesPan → Select assay
4. Start Conversion
5. Check console for:
   ```
   [LFS] Using LFS upload proxy: https://lfsproxy.cplantbox.com/...
   [LFS] Upload complete for ... (status: 200)
   ```

## Temporary Testing (Before SSL is configured)

If you want to test before SSL is ready:

```bash
# On your local machine, set up SSH port forwarding
ssh -L 8443:localhost:443 small

# Then update elab2arc temporarily:
const LFS_UPLOAD_PROXY = 'https://localhost:8443';
```

## Troubleshooting

### Check if service is running
```bash
sudo systemctl status lfs-cors.service
```

### Check service logs
```bash
sudo journalctl -u lfs-cors.service -f
```

### Check nginx logs
```bash
sudo tail -f /var/log/nginx/error.log
```

### Restart everything
```bash
sudo systemctl restart lfs-cors.service
sudo systemctl reload nginx
```

## Files Modified

1. `js/modules/git-lfs-service.js` - Added `LFS_UPLOAD_PROXY` constant and updated upload logic
2. `index.html` - Updated version to `v=20260210000010`

## What Changed

**Before:**
```javascript
if (usedProxy) {
  const normalizedProxy = corsProxy.endsWith('/') ? corsProxy.slice(0, -1) : corsProxy;
  finalUploadUrl = `${normalizedProxy}/${uploadUrl}`;
}
```

**After:**
```javascript
if (usedProxy) {
  const normalizedProxy = LFS_UPLOAD_PROXY.endsWith('/') ? LFS_UPLOAD_PROXY.slice(0, -1) : LFS_UPLOAD_PROXY;
  finalUploadUrl = `${normalizedProxy}/${uploadUrl}`;
}
```

Where `LFS_UPLOAD_PROXY = 'https://lfsproxy.cplantbox.com'` (supports PUT requests)

## Next Steps

1. Deploy the proxy on the server (see steps above)
2. Test with a large file (>10MB) in elab2arc
3. Verify the file was uploaded to GitLab LFS successfully
