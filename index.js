const express = require('express');
const app = express();
const { graphql, buildSchema } = require('graphql');
const graphqlHTTP = require('express-graphql');

const flourishSchema = buildSchema(`
  type Query {
    hello: String
  }
`);

var rootResolver = {
  hello: () => {
    return 'Sweet it werkt!';
  },
};

app.use('/graphql', graphqlHTTP({
  schema: flourishSchema,
  rootValue: rootResolver,
  graphiql: true
}));

app.listen(3000, () => console.log('Server running on port 3000'));
