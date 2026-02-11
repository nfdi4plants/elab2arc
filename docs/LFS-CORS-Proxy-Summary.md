# LFS CORS Proxy Implementation - Current Status

## What We've Done

### 1. Identified the Problem
- The LFS batch API works through the CORS proxy (HTTP 200) ✅
- The upload URL is retrieved successfully ✅
- PUT requests fail because CORS proxy doesn't allow PUT method ❌

Error: `Method PUT is not allowed by Access-Control-Allow-Methods in preflight response.`

### 2. Created LFS-Specific CORS Proxy
Created `/tmp/lfs-cors-proxy-server.js` with:
- OPTIONS preflight handler returning proper CORS headers including PUT
- PUT request forwarding to GitLab LFS
- Host whitelist for security (git.nfdi4plants.org, gitlab.com)
- 5-minute timeout for large file uploads

### 3. Tested the Proxy
- OPTIONS request returns 204 with proper headers ✅
- Server runs on port 8083 ✅

## Deployment Status

### Current State
- Server running on small:8083 (via nohup)
- **Not yet configured as systemd service**
- **Not yet configured with nginx SSL**

### Remaining Steps

#### Step 1: Install as System Service (Requires sudo)
```bash
ssh small
sudo mkdir -p /usr/local/lib/lfs-cors-proxy
sudo cp ~/lfs-cors-proxy/server.js /usr/local/lib/lfs-cors-proxy/
sudo chown -R root:root /usr/local/lib/lfs-cors-proxy
sudo chmod 644 /usr/local/lib/lfs-cors-proxy/server.js
```

#### Step 2: Create Systemd Service
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

sudo systemctl daemon-reload
sudo systemctl enable lfs-cors.service
sudo systemctl start lfs-cors.service
sudo systemctl status lfs-cors.service
```

#### Step 3: Configure Nginx with SSL
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

sudo ln -sf /etc/nginx/sites-available/lfsproxy.cplantbox.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Step 4: Update elab2arc to Use New Proxy

File: `js/modules/git-lfs-service.js`

Update line 190-214 to use the LFS-specific proxy for uploads:

```javascript
// LFS Upload Proxy - handles PUT requests for LFS uploads
const LFS_UPLOAD_PROXY = 'https://lfsproxy.cplantbox.com';

// In uploadToLFS function, when uploading to the presigned URL:
if (usedProxy) {
  // Use LFS-specific proxy for uploads (supports PUT)
  const normalizedProxy = LFS_UPLOAD_PROXY.endsWith('/') ?
    LFS_UPLOAD_PROXY.slice(0, -1) : LFS_UPLOAD_PROXY;
  finalUploadUrl = `${normalizedProxy}/${uploadUrl}`;
  console.log(`[LFS] Using LFS upload proxy: ${finalUploadUrl}`);
}
```

## Testing

### Test 1: OPTIONS Preflight
```bash
curl -v -X OPTIONS \
  -H "Origin: http://localhost:8000" \
  -H "Access-Control-Request-Method: PUT" \
  https://lfsproxy.cplantbox.com/https://git.nfdi4plants.org/
```

Expected: 204 with `Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS`

### Test 2: Full LFS Upload
```bash
# Test via elab2arc application with a file >10MB
# Should see: [LFS] Using LFS upload proxy: https://lfsproxy.cplantbox.com/...
# And: [LFS] Upload complete for ... (status: 200)
```

## Files Created

1. `/Users/xr/git/elab2arc/elab2arc/docs/LFS-CORS-Proxy-Plan.md` - Detailed plan
2. `/Users/xr/git/elab2arc/elab2arc/docs/LFS-CORS-Proxy-Summary.md` - This summary
3. `/tmp/lfs-cors-proxy-server.js` - Proxy server implementation
4. `/tmp/lfs-cors.service` - Systemd service file
5. `/tmp/lfsproxy-nginx.conf` - Nginx configuration

## Next Actions

1. **You (the user)** need to run the sudo commands on the server to complete deployment
2. **Update elab2arc** to use `https://lfsproxy.cplantbox.com` for LFS uploads
3. **Test** with a large file (>10MB) in the elab2arc application

## Temporary Workaround

Until the proxy is fully deployed with SSL, you can test using:
- `http://small:8083/` (internal access only)
- Or set up port forwarding for testing

## Notes

- The proxy currently runs on port 8083
- It only allows requests to git.nfdi4plants.org and gitlab.com
- It handles OPTIONS, GET, POST, and PUT methods
- 5-minute timeout for large file uploads
- CORS headers: `Access-Control-Allow-Origin: *`
