import { ClientV3 } from '../src/index';
import { assert, describe, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';

const globalTestPrefix = `redis-client-test`;
const testPrefix = `${globalTestPrefix}:${randomUUID()}`;

const genKey = (key: string): string => `${testPrefix}:${randomUUID()}:${key}`;

async function cleanupRedis(prefix: string) {
  const client = new ClientV3();

  let curCursor = 0;
  const keysToDelete = [];
  do {
    const [cursor, keys] = await client.SCAN(curCursor, 'match', `${prefix}*`);
    curCursor = +cursor;
    keysToDelete.push(...keys);
  } while (curCursor !== 0);
  if (keysToDelete.length > 0) {
    await client.DEL(...keysToDelete);
  }
}

describe('commands test', function () {
  afterEach(async () => {
    await cleanupRedis(testPrefix);
  });

  // https://redis.io/commands/get/
  // https://redis.io/commands/set/
  it('GET/SET commands', async () => {
    const client = new ClientV3();
    const key = genKey('foo');

    assert.equal(await client.GET(key), null);
    await client.SET(key, 'bar');
    assert.equal(await client.GET(key), 'bar');

    await client.SET(key, 'bar', 'EX', '60');
    const ttl = await client.TTL(key);

    assert.isAtMost(ttl, 60);
  });

  it('EXISTS', async () => {
    const client = new ClientV3();
    const key = genKey('fooExist');
    const key2 = genKey('fooExist2');

    assert.equal(await client.EXISTS(key), 0);
    await client.SET(key, 'test');
    assert.equal(await client.EXISTS(key), 1);

    assert.equal(await client.EXISTS(key, key2), 1);
    await client.SET(key2, 'test2');
    assert.equal(await client.EXISTS(key, key2), 2);
  });

  it('DEL command', async () => {
    const key1 = genKey('keyToDelete1');
    const key2 = genKey('keyToDelete2');
    const key3 = genKey('keyToDelete3');

    const client = new ClientV3();
    await client.SET(key1, 'bar1');
    await client.SET(key2, 'bar2');
    await client.SET(key3, 'bar3');

    assert.equal(await client.DEL(key1), 1);
    assert.equal(await client.GET(key1), null);

    assert.equal(await client.DEL(...[key2, key3]), 2);
    for (const key of [key1, key2]) {
      assert.equal(await client.GET(key), null);
    }
  });

  // https://redis.io/commands/hget
  // https://redis.io/commands/hset
  // https://redis.io/commands/hexists
  it('HGET/HSET/HEXSITS commands', async () => {
    const client = new ClientV3();
    const key = genKey('myHash');

    const fieldKey = 'field';
    const value = 'hello';
    assert.equal(await client.HGET(key, fieldKey), null);
    assert.equal(await client.HEXISTS(key, fieldKey), 0);

    await client.HSET(key, fieldKey, value);

    assert.equal(await client.HGET(key, fieldKey), value);
    assert.equal(await client.HEXISTS(key, fieldKey), 1);
  });

  // https://redis.io/commands/multi
  // https://redis.io/commands/exec
  it('Should execute a multi command', async () => {
    const client = new ClientV3();

    const key = genKey('foo2');
    await client.SET(key, 'bar', 'EX', '60');

    await client.MULTI();
    await client.TTL(key);
    await client.GET(key);
    const [ttl, value] = await client.EXEC();

    assert.ok(ttl);
    assert.ok(+(ttl as string) <= 60);
    assert.equal(value, 'bar');
  });
});
