// import sequelize from '../config/mysql';
// import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes, Sequelize } from 'sequelize';
// import { Users } from './authModel';

// export class GroupUser extends Model {
//     declare group_id: string;
//     declare user_id: string;
// }

// GroupUser.init({
//     // id: {
//     //     type: DataTypes.STRING,
//     //     allowNull: false,
//     //     primaryKey: true
//     // },
//     group_id: {
//         type: DataTypes.STRING,
//         allowNull: false,
//         references: {
//             model: Groups,
//             key: 'id'
//         }
//     },
//     user_id: {
//         type: DataTypes.STRING,
//         allowNull: false,
//         references: {
//             model: Users,
//             key: 'uuid'
//         }
//     },
// }, {
//     sequelize,
//     tableName: 'group_user',
//     timestamps: false
// })

// Users.belongsToMany(Groups, { through: GroupUser, foreignKey: 'uuid' })
// Groups.belongsToMany(Users, { through: GroupUser, foreignKey: 'id' })
