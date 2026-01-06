// import mysql, { ConnectionOptions } from 'mysql2';
import { Sequelize, Options } from 'sequelize';
import chalk from 'chalk';
// create the connection to database

const access: Options = {
  host: process.env.DB_HOST,
  // port: Number(process.env.DB_PORT),
  dialect: 'mysql',
  // logging: false,
  logging: (sql: string, timing?: number | any) => {
    // 1. 將 SQL 關鍵字高亮 (簡單實現)
    const highlightSql = sql
      .replace(/SELECT/g, chalk.cyan('SELECT'))
      .replace(/FROM/g, chalk.magenta('FROM'))
      .replace(/WHERE/g, chalk.yellow('WHERE'))
      .replace(/UPDATE/g, chalk.red('UPDATE'));

    // 2. 輸出格式化後的內容
    console.log(
      `${chalk.gray('[Sequelize]')} ${highlightSql} ${chalk.green(`(+${timing}ms)`)}`,
    );
  },
  benchmark: true, // 必須開啟此項，timing 參數才會有值
};

// 透過 new 建立 Sequelize 這個 class，而 sequelize 就是物件 instance
// process.env.DB_NAME as string, process.env.DB_USER as string, process.env.DB_PASSWORD
const sequelize = new Sequelize(
  `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  {
    ...access,
    dialect: 'mysql',
  },
);
const sqlConnectTest = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};

sqlConnectTest();

export default sequelize;

// const access: ConnectionOptions = {
//   host: 'bhz7pvkreijcbfw6rbpy-mysql.services.clever-cloud.com',
//   user: 'u0zzt1ffgxwlalum',
//   password: 'qL3UPDRrwlxprPWS8kh6',
//   database: 'bhz7pvkreijcbfw6rbpy',
//   port: 3306
// };

// const connection = mysql.createPool(access);
// type SqlValues<T> = T | SqlValues<T>[];
// const connectHandler = async <T>(query: string, values?: SqlValues<string | number | boolean>) => {
//   const connect = new Promise((resolve, reject) => {
//     // For pool initialization, see above
//     connection.getConnection((err, conn) => {
//       if (err) {
//         reject(new AppError(`sql err: ${err}`, 500));
//       } else {
//         // Do something with the connection
//         conn.query(query, values, (err, rows) => {
//           if (err) {
//             reject(new AppError(`sql err: ${err}`, 500));
//           } else {
//             resolve(rows);
//           }
//           // Don't forget to release the connection when finished!
//           connection.releaseConnection(conn);
//         });
//       }
//     });
//   });

//   return connect as Promise<T>;
// };
