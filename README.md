# Camaro Redis

> Forked from https://github.com/camarojs/redis

## Features

Redis client which supports [resp3](https://github.com/antirez/RESP3/blob/master/spec.md).

- [Resp3](https://github.com/antirez/RESP3/blob/master/spec.md) support
- All command return promises
- Support for ES6 types, such as Map and Set
- TLS support

## Quick Start

### Install

```bash
npm install @camaro/redis
```

### Usage

```js
// If you want to use resp2 ,change `ClientV3` to `ClientV2`.
const { ClientV3: Client } = require('@camaro/redis');
const client = new Client();

await client.SET('foo', 'bar');
const response = await client.GET('foo');
console.log(response); // 'bar'

await client.QUIT();
```

## API Reference

### Client Options

Here are the list of options (with their default values) that you can pass to the constructor.

```js
const client = new Client({
  host: '127.0.0.1', // IP address of the redis server
  port: 6379, // Port of the redis server
  username: 'default', // username
  password: undefined, // Password
  db: 0, // Redis database to use (see https://redis.io/commands/select/)
  reconnection: true, // Whether to reconnect when an error occurs
  logger: undefined, // callback function to log commands (e.g. console.log)
  tls: undefined, // Object passed as options to [tls.connect()](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback)
});
```

### Commands

Redis commands can be used like this:

```js
const client = new Client();

// https://redis.io/commands/set/
await client.SET('mykey', 'Hello');
await client.SET('anotherkey', 'will expire in a minute', 'EX', 60);

// https://redis.io/commands/get/
await client.GET('mykey'); // "Hello"

// https://redis.io/commands/hset/
await client.HSET('myhash', 'field1', 'Hello');

// https://redis.io/commands/hget/
await client.HGET('myhash', 'field1'); // "Hello"

// https://redis.io/commands/hgetall/
await client.HGETALL('myhash'); // "Map(1) { 'field1' => 'Hello' }"
// ... other commands
```

See the complete list: [https://redis.io/commands](https://redis.io/commands).

### Events

- `message`: See [Pub/Sub](#Pub/Sub)
- `error`: Emitted when an error occurs.
- `connect`: Emitted when the connection with the Redis server is established. Commands issued before the `connect` event are queued, and replayed just before this event is emitted.

### Pub/Sub

You can receive `pub/sub` messages by using the `.on('message')` event handler.
If you are using the resp2, you need to create a new client to receive messages.

```js
const client = new Client();

client.SUBSCRIBE('test');
client.on('message', (data) => {
  // data: ['message', 'somechannel', 'this is the message']
  console.log(data);
});
```

### Client-side caching

You can implement [Client-side caching](https://redis.io/docs/manual/client-side-caching/) on top of this library.

Here is a very simple example which uses a `Map` to cache results from Redis.
Listen for invalidation messages to know when to remove entries from your local cache.

> Note that if you use TTL, you would also need to manage them for the local cache as Redis does not send invalidation message when the TTL expires

```js
const { ClientV3: Client } = require('@camaro/redis');
const client = new Client();

const localCache = new Map();

client.on('message', (args) => {
  const [message, values] = args;
  console.log(message, values);
  if (message === 'invalidate') {
    for (const key of values) {
      localCache.delete(key);
    }
  }
});

await client.CLIENT('tracking', 'on');
// if you prefer to use the Broadcasting mode, use
// https://redis.io/docs/manual/client-side-caching/#broadcasting-mode
// await client.CLIENT('tracking', 'on', 'BCAST');

async function get(key) {
  if (localCache.has(key)) {
    return localCache.get(key);
  }

  const response = await client.GET('foo');
  localCache.set('foo', response);
  return response;
}

await client.SET('foo', 'bar');
console.log(await get('foo')); // from redis server
console.log(await get('foo')); // from local cache

await client.SET('foo', 'baz'); // will trigger an invalidation message
console.log(await get('foo')); // from redis server
```
