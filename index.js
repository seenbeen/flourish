const express = require('express');
const Promise = require('es6-promise').Promise;
const { graphql, buildSchema } = require('graphql');
const graphqlHTTP = require('express-graphql');
const mysql = require('mysql');
const _ = require('lodash');

const app = express();

const flourishSchema = buildSchema(`
  type Query {
    hello: String
    me(userId: String!): User!
  }
  type Mutation {
    createLoan(info: LoanCreationInfo!): Loan!
    initiateSettlement(settlementHash: String!): Loan!
    tickSettlements: Boolean!
  }

  type User {
    firstName: String!
    lastName: String!
    trust: Int!
    activeLoans: [Loan!]!
    pastLoans: [Loan!]!
  }
  type Loan {
    slots: [LoanSlot!]!
    amount: Int!
    purpose: String!
    startDate: String! # ISO 8601
  }
  type LoanSlot {
    netAmount: Int!
    settlementHash: String
    loanStatus: LoanStatus!
    settledWith: [String!]
    settledOn: String # ISO 8601
    settleBy: String! # ISO 8601
    settleReason: String
  }

  input LoanCreationInfo {
    userId: String!
    startDate: String! # ISO 8601
  }

  enum LoanStatus {
    NOT_STARTED
    FAILED
    PENDING
    SUCCEEDED
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

const MOCK_ME = {
  firstName: 'Seenbeen',
  lastName: 'Na',
  activeLoans: [],
  pastLoans: []
};

const MOCK_TRUST = { trust: (args, context) => Promise.resolve(context.trust).then(res => res) };

const rootResolver = {
  hello: () => {
    return connectFlourishDB()
      .then(con => con.query('SELECT * FROM user;'))
      .then(res => res[0].firstName)
      .catch(err => `RIP ${err}`);
  },
  me: (args, context) => {
    return new Promise((resolve,reject) => {
      context.trust = 1338;
      return resolve(_.extend({},MOCK_ME,MOCK_TRUST));
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
