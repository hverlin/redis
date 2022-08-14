import { ClientV3 } from '../src/index';
import { assert, describe, it, afterEach, beforeEach, expect } from 'vitest';
import { randomUUID } from 'crypto';

const globalTestPrefix = `redis-client-test`;
const testPrefix = `${globalTestPrefix}:${randomUUID()}`;

const genKey = (key?: string): string => `${testPrefix}:${randomUUID()}:${key ?? 'key'}`;

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
  await client.QUIT();
}

describe('commands test', function () {
  let client: ClientV3;
  afterEach(async () => {
    if (client) {
      await client.QUIT();
    }
    await cleanupRedis(testPrefix);
  });

  beforeEach(() => {
    client = new ClientV3();
  });

  it('INFO command', async () => {
    const infoRes = await client.INFO();
    const info = infoRes.split('\r\n');
    assert.equal(info[0], '# Server');
    assert.include(info[1], 'redis_version');

    const clientInfo = await client.INFO('clients');
    const res = clientInfo.split('\r\n');
    const connectedClientsLine = res[1];
    assert.ok(+(connectedClientsLine?.split(':')[1] ?? 0) >= 1, clientInfo[0]);
  });

  it('PING command', async () => {
    assert.equal(await client.PING(), 'PONG');
    assert.equal(await client.PING('test'), 'test');
  });

  // https://redis.io/commands/get/
  // https://redis.io/commands/set/
  it('GET/SET commands', async () => {
    const key = genKey('foo');

    assert.equal(await client.GET(key), null);
    await client.SET(key, 'bar');
    assert.equal(await client.GET(key), 'bar');

    await client.SET(key, 'bar', 'EX', '60');
    const ttl = await client.TTL(key);

    assert.isAtMost(ttl, 60);
  });

  it('EXISTS', async () => {
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

  it('MSET/MGET/MSETNX commands', async () => {
    const key1 = genKey();
    const key2 = genKey();
    assert.equal(await client.MSET(key1, 'Hello', key2, 'world'), 'OK');
    assert.deepEqual(await client.MGET(key1, key2), ['Hello', 'world']);
    assert.deepEqual(await client.MGET(genKey(), key2), [null, 'world']);

    assert.equal(await client.MSETNX(key1, 'Hello', key2, 'world'), 0);

    const key3 = genKey();
    const key4 = genKey();
    assert.equal(await client.MSETNX(key3, 'tx', key4, 'test'), 1);
    assert.deepEqual(await client.MGET(key3, key4, genKey()), ['tx', 'test', null]);
  });

  // https://redis.io/commands/hget
  // https://redis.io/commands/hset
  // https://redis.io/commands/hexists
  it('HGET/HSET/HEXISTS commands', async () => {
    const key = genKey('myHash');

    const fieldKey = 'field';
    const value = 'hello';
    assert.equal(await client.HGET(key, fieldKey), null);
    assert.equal(await client.HEXISTS(key, fieldKey), 0);

    await client.HSET(key, fieldKey, value);

    assert.equal(await client.HGET(key, fieldKey), value);
    assert.equal(await client.HEXISTS(key, fieldKey), 1);
  });

  it('APPEND command', async () => {
    const key = genKey();
    assert.equal(await client.APPEND(key, 'Hello'), 5);
    assert.equal(await client.APPEND(key, ' World'), 11);
    assert.equal(await client.GET(key), 'Hello World');
  });

  it('INCR/DECR commands', async () => {
    const key = genKey();
    await client.SET(key, '10');
    assert.equal(await client.INCR(key), 11);
    assert.equal(await client.INCRBY(key, 5), 16);
    assert.equal(await client.GET(key), '16');

    assert.equal(await client.DECR(key), 15);
    assert.equal(await client.DECRBY(key, 2), 13);

    await client.SET(key, 'test');
    await expect(client.INCR(key)).rejects.toThrow('ERR value is not an integer or out of range');
    await expect(client.DECR(key)).rejects.toThrow('ERR value is not an integer or out of range');
  });

  it('STRLEN command', async () => {
    const key = genKey();
    await client.SET(key, 'hello');
    assert.equal(await client.STRLEN(key), 5);
    assert.equal(await client.STRLEN(genKey()), 0);
  });

  it('INCRBYFLOAT command', async () => {
    const key = genKey();

    await client.SET(key, 'test');
    await expect(client.INCRBYFLOAT(key, 0.2)).rejects.toThrow('ERR value is not a valid float');

    await client.SET(key, '10');
    assert.equal(+(await client.INCRBYFLOAT(key, 0.1)), 10.1);
    assert.equal(+(await client.INCRBYFLOAT(key, -5)), 5.1);
  });

  // https://redis.io/commands/multi
  // https://redis.io/commands/exec
  it('Should execute a multi command', async () => {
    const key = genKey('foo2');
    assert.equal(await client.SET(key, 'bar', 'EX', '60'), 'OK');

    await client.MULTI();
    await client.TTL(key);
    await client.GET(key);
    const [ttl, value] = await client.EXEC();

    assert.ok(ttl);
    assert.ok(+(ttl as string) <= 60);
    assert.equal(value, 'bar');
  });
});
