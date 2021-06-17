import * as mysql from "mysql";

const dbConfig = {
  host: process.env.DB_HOST,
  user: "notifier",
  password: process.env.DB_PASSWORD,
  database: "notifier",
};

function query<T>(sql: string, params?: any[]): Promise<T> {
  return new Promise<T>(async (resolve, reject) => {
    const connection = mysql.createConnection(dbConfig);
    connection.connect();

    if (process.env.NODE_ENV !== "test") {
      console.debug({ sql, params }, "Execute query");
    }
    connection.query(sql, params, (error: mysql.MysqlError, result?: T) => {
      connection.end();
      if (error) {
        console.error({ sql, error }, "Query error");
        reject(error);
      } else {
        resolve(result!);
        if (process.env.NODE_ENV !== "test") {
          console.debug({ result }, "DB result");
        }
      }
    });
  });
}

async function fetch<T>(sql: string, params?: any[]): Promise<T[]> {
  const result = await query<T[]>(sql, params);
  return result ?? [];
}

async function fetchOne<T>(
  sql: string,
  params?: any[],
  defaultValue?: T
): Promise<T> {
  const result = await fetch<T>(sql, params);
  if (result === undefined || result[0] === undefined) {
    // Makes it as non-null result.
    return defaultValue ?? ({} as any as T);
  }
  return result[0];
}

export function fetchSubscribedChannels(token: string) {
  return fetch<{ id: string }>(`SELECT id FROM subs WHERE token=?`, [token]);
}

export function leaveSubscription(id: string) {
  return query<number>(`DELETE FROM subs WHERE id=?`, [id]);
}

export function subscribe(id: string, token: string) {
  return query<number>(`REPLACE INTO subs (id, token) VALUES (?, ?)`, [
    id,
    token,
  ]);
}

export function unsubscribe(id: string, token: string) {
  return query<number>(`DELETE FROM subs WHERE id=? AND token=?`, [id, token]);
}

export function fetchSubscriptionStatus(id: string) {
  return fetchOne<{ status: string }>(
    `SELECT GROUP_CONCAT(token SEPARATOR '\n') AS status FROM subs WHERE id=? GROUP BY id`,
    [id],
    { status: "" }
  );
}
