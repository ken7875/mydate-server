// import mysql, { ConnectionOptions } from 'mysql2';
import { Sequelize, Options } from 'sequelize';
// create the connection to database

const access: Options = {
  host: process.env.DB_HOST,
  // port: Number(process.env.DB_PORT),
  dialect: 'mysql',
  // logging: false,
  logging: function (str, time) {
    console.log(str, time, 'str');
    // do your own logging
  },
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
