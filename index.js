const express = require('express');
const Promise = require('es6-promise').Promise;
const { graphql, buildSchema } = require('graphql');
const graphqlHTTP = require('express-graphql');
const mysql = require('mysql');

const app = express();

const flourishSchema = buildSchema(`
  type Query {
    hello: String
    user(id: Int!): User
  }
  type User {
    firstName: String!
    lastName: String!
    userId: String!
    age: Int!
    favoriteAminal: String
  }
`);

function connectDB(user, pass, db) {
  return new Promise((resolve, reject) => {
    var con = mysql.createConnection({
      host: 'localhost',
      user: user,
      password: pass,
      database: db
    });

    con.connect(function(err) {
      if (err) {
        return reject(err);
      }
      return resolve({
        query: q => new Promise((resolve, reject) => {
          con.query(q, function(err, result, fields) {
            if (err) return reject(err);
            return resolve(result);
          });
        })
      });
    });
  });
}

function connectFlourishDB() {
  return connectDB('root','root','flourishdb');
}

var rootResolver = {
  hello: () => {
    return connectFlourishDB()
      .then(con => con.query('SELECT * FROM user;'))
      .then(res => res[0].firstName)
      .catch(err => `RIP ${err}`);
  },
  user: (args) => {
    return new Promise((resolve,reject) => {
      if (args.id == 1337) {
        return resolve({ firstName: "Seenbeen", lastName: "Na", userId: "1337", age: 21, favoriteAminal: "IS IT A BEAR" }); 
      }
      return resolve({ firstName: "Unknown", lastName: "Unknown", userId: "Unknown", age: 0 });
    }).then(res => res);
  }
};

app.get('/graphql', graphqlHTTP({
  schema: flourishSchema,
  rootValue: rootResolver,
  graphiql: true
}));

app.post('/graphql', graphqlHTTP({
  schema: flourishSchema,
  rootValue: rootResolver,
  graphiql: false
}));

app.listen(3000, () => console.log('Server running on port 3000'));
