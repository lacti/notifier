import * as mysql from 'mysql';

const dbConfig = {
  host: process.env.DB_HOST,
  user: 'notifier',
  password: process.env.DB_PASSWORD,
  database: 'notifier',
};

const query = <T>(sql: string, params?: any[]) =>
  new Promise<T | undefined>(async (resolve, reject) => {
    const connection = mysql.createConnection(dbConfig);
    connection.connect();

    if (process.env.NODE_ENV !== 'test') {
      console.log(`Execute query:`, sql, params);
    }
    connection.query(sql, params, (error: mysql.MysqlError, result?: T) => {
      connection.end();
      if (error) {
        console.error(`Query error:`, sql, error);
        reject(error);
      } else {
        resolve(result);
        if (process.env.NODE_ENV !== 'test') {
          console.log(`DB result:`, result);
        }
      }
    });
  });

const fetch = <T>(sql: string, params?: any[]) =>
  query<T[]>(sql, params).then(res => res || []);

const fetchOne = <T>(sql: string, params?: any[], defaultValue?: T) =>
  fetch<T>(sql, params).then(res => {
    if (res === undefined || res[0] === undefined) {
      // Makes it as non-null result.
      return defaultValue || (({} as any) as T);
    }
    return res[0];
  });

export const fetchSubscribedChannels = (token: string) =>
  fetch<{ id: string }>(`SELECT id FROM subs WHERE token=?`, [token]);

export const leaveSubscription = (id: string) =>
  query<number>(`DELETE FROM subs WHERE id=?`, [id]);

export const subscribe = (id: string, token: string) =>
  query<number>(`REPLACE INTO subs (id, token) VALUES (?, ?)`, [id, token]);

export const unsubscribe = (id: string, token: string) =>
  query<number>(`DELETE FROM subs WHERE id=? AND token=?`, [id, token]);

export const fetchSubscriptionStatus = (id: string) =>
  fetchOne<{ status: string }>(
    `SELECT GROUP_CONCAT(token SEPARATOR '\n') AS status FROM subs WHERE id=? GROUP BY id`,
    [id],
  );
