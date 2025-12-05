// import sequelize from "../config/mysql";
// import {
//   DataTypes,
//   Model,
//   HasManyGetAssociationsMixin,
//   HasManySetAssociationsMixin,
// } from "sequelize";
// import { Users } from "./authModel";
// // import { GroupUser } from './groupAuthModel';

// export class Groups extends Model {
//   declare id: string;
//   declare name: string;
//   declare member: string;

//   declare setUsers: HasManySetAssociationsMixin<Users, string>;
//   declare getUsers: HasManyGetAssociationsMixin<Users>;
//   // public readonly createdAt!: Date;
//   // public readonly updatedAt!: Date;
// }

// Groups.init(
//   {
//     id: {
//       type: DataTypes.STRING,
//       allowNull: false,
//       autoIncrement: true,
//       primaryKey: true,
//     },
//     name: {
//       type: DataTypes.STRING,
//       allowNull: true,
//     },
//     member: {
//       type: DataTypes.STRING,
//       allowNull: false,
//     },
//     //   avatars: {
//     //     type: DataTypes.STRING,
//     //     allowNull: true,
//     //     unique: true
//     //   },
//   },
//   {
//     sequelize,
//     tableName: "groups",
//     timestamps: false,
//   }
// );

// // 在 Group 模型中定义外键关联到 User 模型
// // Groups.belongsTo(Users, {
// //   foreignKey: "member",
// //   targetKey: "uuid",
// //   constraints: true,
// //   onDelete: "CASCADE",
// //   onUpdate: "CASCADE",
// // });

// export const setGroup = async ({
//   id,
//   name,
//   member,
//   avatars,
// }: {
//   id: string;
//   name: string;
//   member: string[];
//   avatars?: string;
// }) => {
//   const group = await Groups.create({
//     id,
//     name,
//     avatars,
//   });

//   const user = await Users.findOne({
//     where: {
//       uuid: member[0],
//     },
//   });

//   console.log(group, group.dataValues);
//   (group as any).addUsers(user);

//   return group;
// };

// // { uuid }: { uuid: string }
// export const getGroup = async ({ uuid }: { uuid: string }) => {
//   const group = await Groups.findAll({
//     include: Users,
//   });

//   // (group as any).addUsers(user)

//   return group;
// };
// // Users.belongsToMany(Groups, { through: GroupUser, foreignKey: 'uuid' })
// // Groups.belongsToMany(Users, { through: GroupUser, foreignKey: 'id' })
