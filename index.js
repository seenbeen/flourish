const express = require('express');
const Promise = require('es6-promise').Promise;
const { graphql, buildSchema } = require('graphql');
const graphqlHTTP = require('express-graphql');

const app = express();

const flourishSchema = buildSchema(`
  type Query {
    hello: String
  }
`);

var rootResolver = {
  hello: () => {
    return Promise.resolve(()=>'Keks it werkt!').then(res => res());
  },
};

app.use('/graphql', graphqlHTTP({
  schema: flourishSchema,
  rootValue: rootResolver,
  graphiql: true
}));

app.listen(3000, () => console.log('Server running on port 3000'));
