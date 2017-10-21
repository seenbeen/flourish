const express = require('express');
const Promise = require('es6-promise').Promise;
const { graphql, buildSchema } = require('graphql');
const graphqlHTTP = require('express-graphql');

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

var rootResolver = {
  hello: () => {
    return Promise.resolve(()=>'Keks it werkt!').then(res => res());
  },
  user: (args) => {
    return new Promise((resolve,reject) => {
      if (args.id == 1337) {
        resolve({ firstName: "Seenbeen", lastName: "Na", userId: "1337", age: 21, favoriteAminal: "IS IT A BEAR" }); 
      }
      resolve({ firstName: "Unknown", lastName: "Unknown", userId: "Unknown", age: 0 });
    }).then(res => res);
  }
};

app.use('/graphql', graphqlHTTP({
  schema: flourishSchema,
  rootValue: rootResolver,
  graphiql: true
}));

app.listen(3000, () => console.log('Server running on port 3000'));
