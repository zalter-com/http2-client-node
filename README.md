# @zalter/http2-client-node

> An internal package

## Usage

```javascript
import { Client } from '@zalter/http2-client-node';

const client = new Client();
const response = await client.request('https://domain.example', {
  headers: {
    ':method': 'GET',
    'content-type': 'application/json'
  },
  body: JSON.stringify({ name: 'John' })
});

const data = JSON.parse(response.body);
console.log(`Received response status: ${response.headers[':status']}`); 
```
