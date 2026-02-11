# LFS-Specific CORS Proxy Implementation Plan

## Problem Statement

The elab2arc application needs to upload large files (>10MB) to GitLab LFS from the browser. The current CORS proxy (`corsproxy.cplantbox.com`) only supports GET requests, causing LFS uploads to fail with:

```
Method PUT is not allowed by Access-Control-Allow-Methods in preflight response.
```

## Solution Overview

Create a specialized CORS proxy for LFS uploads that:
1. Handles OPTIONS preflight requests with proper CORS headers
2. Forwards PUT requests to GitLab LFS with authorization headers
3. Returns proper CORS headers in all responses

## Architecture

```
Browser → LFS CORS Proxy → GitLab LFS API
         (lfsproxy.cplantbox.com)
```

## Proxy Requirements

### 1. Preflight (OPTIONS) Handler
```
Request:
  OPTIONS /https://git.nfdi4plants.org/.../gitlab-lfs/objects/...
  Origin: http://localhost:8000
  Access-Control-Request-Method: PUT
  Access-Control-Request-Headers: authorization, content-type

Response:
  Status: 204 (No Content)
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS
  Access-Control-Allow-Headers: authorization, content-type, content-length
  Access-Control-Max-Age: 86400
```

### 2. Upload (PUT) Handler
```
Request:
  PUT /https://git.nfdi4plants.org/.../gitlab-lfs/objects/...
  Authorization: Basic <presigned-token>
  Content-Type: application/octet-stream
  Body: <file content>

Response:
  Forward GitLab response as-is
  Add CORS headers: Access-Control-Allow-Origin: *
```

## Implementation Options

### Option 1: Cloudflare Worker (Recommended)
- Pros: Edge deployment, free tier, handles CORS automatically
- Cons: Need to deploy to Cloudflare

### Option 2: Node.js HTTP Proxy (ssh small)
- Pros: Full control, easy to debug
- Cons: Need server maintenance

### Option 3: Nginx Reverse Proxy
- Pros: Production-grade, efficient
- Cons: Complex configuration for dynamic headers

## Implementation Details

### JavaScript/Node.js Proxy (for ssh small)

```javascript
const http = require('http');
const https = require('https');
const url = require('url');

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, content-length',
  'Access-Control-Max-Age': '86400'
};

// Create proxy server
const server = http.createServer((req, res) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Extract target URL from path
  const targetUrl = req.url.substring(1); // Remove leading '/'

  if (!targetUrl.startsWith('https://')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  // Parse target URL
  const parsedUrl = url.parse(targetUrl);

  // Prepare options for target request
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: req.method,
    headers: {
      ...req.headers,
      host: parsedUrl.host
    }
  };

  // Forward request to GitLab
  const proxyReq = https.request(options, (proxyRes) => {
    // Add CORS headers to response
    const headers = { ...proxyRes.headers, ...CORS_HEADERS };
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    res.writeHead(500, CORS_HEADERS);
    res.end('Proxy error');
  });

  // Pipe request body
  req.pipe(proxyReq);
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`LFS CORS Proxy running on port ${PORT}`);
});
```

### Cloudflare Worker

```javascript
export default {
  async fetch(request) {
    // Handle CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, content-type, content-length',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Extract target URL
    const url = new URL(request.url);
    const targetUrl = url.pathname.substring(1);

    // Forward request with headers
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });

    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*'
    };

    return new Response(response.body, {
      status: response.status,
      headers: { ...response.headers, ...corsHeaders }
    });
  }
};
```

## Deployment on ssh small

1. **Upload proxy script** to server
2. **Configure as systemd service** for auto-restart
3. **Set up reverse proxy** (nginx) with SSL
4. **Test with curl** and browser

## Testing

```bash
# Test OPTIONS
curl -v -X OPTIONS \
  -H "Origin: http://localhost:8000" \
  -H "Access-Control-Request-Method: PUT" \
  https://lfsproxy.cplantbox.com/https://git.nfdi4plants.org/...

# Test PUT
curl -v -X PUT \
  -H "Authorization: Basic ..." \
  -H "Content-Type: application/octet-stream" \
  --data-binary @file \
  https://lfsproxy.cplantbox.com/https://git.nfdi4plants.org/...
```

## Integration with elab2arc

Update `git-lfs-service.js` to use the new proxy:

```javascript
const LFS_UPLOAD_PROXY = 'https://lfsproxy.cplantbox.com';

// In uploadToLFS function, use LFS_UPLOAD_PROXY for uploads
const finalUploadUrl = `${LFS_UPLOAD_PROXY}/${uploadUrl}`;
```

## Security Considerations

1. **Rate limiting**: Prevent abuse
2. **Authorization**: Verify requests are for GitLab LFS endpoints only
3. **Logging**: Track uploads for debugging
4. **Size limits**: Enforce reasonable upload size limits

## Timeline

1. Deploy basic proxy on ssh small (1 hour)
2. Test with elab2arc (30 min)
3. Configure nginx + SSL (30 min)
4. Monitor and adjust (ongoing)
