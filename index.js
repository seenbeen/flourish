const express = require('express');
const Promise = require('es6-promise').Promise;
const { graphql, buildSchema } = require('graphql');
const graphqlHTTP = require('express-graphql');
const mysql = require('mysql');
const _ = require('lodash');
const moment = require('moment');

const blockchain = require('mastercard-blockchain');
const MasterCardAPI = blockchain.MasterCardAPI;
const protobuf = require("protobufjs");

const async = require('async'), encoding = 'hex', fs = require('fs');


function getProperties(obj) {
  var ret = [];
  for (var name in obj) {
    if (obj.hasOwnProperty(name)) {
      ret.push(name);
    }
  }
  return ret;
}


function guessNested(root) {
  var props = getProperties(root.nested);
  var firstChild = getProperties(root.nested[props[0]].nested);
  return [props[0], firstChild[0]];
}

function authenticateMasterCard() {
  return new Promise((resolve, reject) => {
    var authentication = new MasterCardAPI.OAuth('Z8uM_eLGoiZrbxdFVXwRdmvbCXcy2WxZlAEsvMaP8dd2fcd1!bb6adc6b34f4462c8adcabfde61bce4e0000000000000000', 'flourish.p12', 'keyalias', 'keystorepassword');
    MasterCardAPI.init({
      sandbox: true,
      authentication: authentication
    });
    protobuf.load('settle.proto', (err, root) => {
      if (err) {
        console.log('error', err);
      } else {
        var nested = guessNested(root);
        if (nested && 2 == nested.length) {
          appID = nested[0];
          msgClassDef = root.lookupType(appID + "." + nested[1]);
          console.log('initialized');
	  return resolve(appID,msgClassDef);
        } else {
          console.log('could not read message class def from', protoFile);
        }
      }
    });
  });
}

const app = express();

const flourishSchema = buildSchema(`
  type Query {
    hello: String
    me(userId: String!): User!
  }
  type Mutation {
    createLoan: Boolean!
    initiateSettlement(settlementHash: String!): Boolean!
    confirmSettlement(settlementHash: String!): Boolean!
    tickSettlements: Boolean!
    happyState: Boolean!
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
    COMPLETED
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

const MOCK_LOAN = {
  slots: _.times(5,
    ()=>({ 
      netAmount: -250,
      loanStatus: "NOT_STARTED",
      settleReason: null,
      settleBy: "SOME DATE",
      settledOn: null,
      settledWith: null,
      settlementHash: null
    }))
  ,
  amount: 500,
  purpose: "Because I can",
  startDate: moment().toISOString()
};

const MOCK_ME = {
  firstName: 'Seenbeen',
  lastName: 'Na',
  activeLoans: [MOCK_LOAN,MOCK_LOAN],
  pastLoans: [MOCK_LOAN,MOCK_LOAN,MOCK_LOAN,MOCK_LOAN]
};

const MOCK_TRUST = { trust: (args, context) => Promise.resolve(context.trust).then(res => res) };

function createLoanResolver({ info }, context) {
  return connectFlourishDB()
    .then(con => con.query(`INSERT INTO schedule (id, purpose, userId, startDate, loanTotal) VALUES (2, "Car Breakdown", 1, "${moment().format('YYYY-MM-DD HH:mm:ss')}",500)`)
      .then(() => con.query(`insert into settlement (amount, status, scheduleId, settleBy) values (-125, 'NOT_STARTED', 2, "${moment().add(0,'week').format('YYYY-MM-DD HH:mm:ss')}");`))
      .then(() => con.query(`insert into settlement (amount, status, scheduleId, settleBy) values (-125, 'NOT_STARTED', 2, "${moment().add(1,'week').format('YYYY-MM-DD HH:mm:ss')}");`))
      .then(() => con.query(`insert into settlement (amount, status, scheduleId, settleBy) values (500, 'NOT_STARTED', 2, "${moment().add(2,'week').format('YYYY-MM-DD HH:mm:ss')}");`))
      .then(() => con.query(`insert into settlement (amount, status, scheduleId, settleBy) values (-125, 'NOT_STARTED', 2, "${moment().add(3,'week').format('YYYY-MM-DD HH:mm:ss')}");`))
      .then(() => con.query(`insert into settlement (amount, status, scheduleId, settleBy) values (-125, 'NOT_STARTED', 2, "${moment().add(4,'week').format('YYYY-MM-DD HH:mm:ss')}");`))
    )
    .then(() => true);
}

function initiateSettlementResolver({ settlementHash }, context) {
  return authenticateMasterCard()
    .then((appID,msgClassDef) => new Promise((resolve, reject) => {
      blockchain.Settle.create({ "encoding": encoding, "hash": settlementHash }, (err, result) => {
	  if (err) {
            return resolve(false);
          } else {
            return resolve(true);
          }
      });
    }))
   .then(result => result);
}

function confirmSettlementResolver({ settlementHash }, context) {
  return authenticateMasterCard()
    .then((appID,msgClassDef) => new Promise((resolve, reject) => {
      blockchain.Settle.create({ "encoding": encoding, "hash": settlementHash }, (err, result) => {
          if (err) {
            if (err.rawErrorData.message === `${settlementHash} is already settled.`) {
               return resolve(true);
            }
            return resolve(false);
          } else {
            return resolve(true);
          }
      });
    }))
   .then(result => result);
}

function tickSettlementsResolver(args, context) {
  return true;
}

const HAPPY_SCHED = [ { purpose: "College Funds",
			weeksBack: 25, id: 1 },
		      { purpose: "Rent",
			weeksBack: 20, id: 2 },
		      { purpose: "Emergency Medical Funds",
			weeksBack: 15, id: 3 },
		      { purpose: "Rent",
			weeksBack: 10, id: 4 },
		      { purpose: "Pet Vet Visit",
			weeksBack: 5, id: 5 } ];
const HAPPY_USERS = [
  { id: 1, firstName: 'Jason', lastName: 'Du', trust: 100, mastercardId: 'JD123' },
  { id: 2, firstName: 'Jane', lastName: 'Smith', trust: 100, mastercardId: 'JS123' },
  { id: 3, firstName: 'Joy', lastName: 'Wong', trust: 100, mastercardId: 'JW123' },
  { id: 4, firstName: 'Sam', lastName: 'Hills', trust: 100, mastercardId: 'SH123' },
  { id: 5, firstName: 'George', lastName: 'Lander', trust: 100, mastercardId: 'GL123' }
];


function happyStateResolver() {
  return connectFlourishDB()
    .then(con => con.query('DELETE FROM schedule where id = 2')
	.then(() => con.query('DELETE FROM settlement where scheduleId = 2')))
    .then(() => true); 
  const Temp = connectFlourishDB()
    .then(con => con.query('DELETE FROM schedule;')
      .then(() => Promise.all(_.map(HAPPY_SCHED, ({ purpose, weeksBack, id }) => con.query(`INSERT INTO schedule (id, purpose, userId, startDate, loanTotal) VALUES (${id}, "${purpose}", 1, "${moment().subtract('week', weeksBack).format('YYYY-MM-DD HH:mm:ss')}", 500);`))))
      .then(() => con.query('DELETE FROM user;'))
      .then(() => Promise.all(_.map(HAPPY_USERS, r => 
        con.query(`INSERT INTO user (id, firstName, lastName, trust, mastercardId) VALUES (${r.id},"${r.firstName}","${r.lastName}",${r.trust},"${r.mastercardId}")`))))
      .then(() => con.query('DELETE FROM settlement'))
      .then(() => Promise.all(_.map(HAPPY_SETTLEMENTS, r =>
        con.query(`INSERT INTO settlement (amount,fromUser,toUser,status,scheduleId,settleBy) VALUES (${amount},${fromUser},${toUser},"COMPLETED",${scheduleId},"${settleBy}");`))))
    )
    .then(res => true); 
}

const rootResolver = {
  hello: () => {
    return connectFlourishDB()
      .then(con => con.query('SELECT * FROM user;'))
      .then(res => res[0].firstName)
      .catch(err => `RIP ${err}`);
  },
  me: (args, context) => {
    const ans = {};
    return connectFlourishDB()
      .then(con => con.query('SELECT * FROM user where id = 1;')
	.then(res => {
          ans.firstName = res[0].firstName;
          ans.lastName = res[0].lastName;
          ans.pastLoans = [];
	  ans.activeLoans = [];
	  ans.trust = res[0].trust;
          return con.query('SELECT * FROM schedule where userId = 1')
	    .then(res => Promise.all(_.map(res, (sched) => con.query(`SELECT * FROM settlement where scheduleId = ${sched.id}`)
									.then(sets => { ans.activeLoans.push({
									   amount: 500,
									   startDate: sched.startDate,
									   purpose: sched.purpose,
									   slots: _.map(sets,set => ({ 
									        netAmount: set.amount,
      										loanStatus: set.status,
      										settleReason: (() => {
	if (set.amount > 0) {
		return sched.purpose;
	}
	if (set.status === 'COMPLETED') {	
		return ['College Fund', 'Auto Fund', 'Medical Fund', 'Pet Fund'][_.random(0, 3)];
	} else {
		return null;
	}
	})(),
      										settleBy: set.settleBy,
      										settledOn: set.status === 'COMPLETED'? set.settleBy:null,
      										settledWith: (() => {
										  if (set.status === 'COMPLETED') {
										    if (set.amount > 0) {
											return ['Jane','Joy','Sam','George'];
										    } else {
											return [['Jane','Joy','Sam','George'][_.random(0, 3)]];
										    }
										  } else {
								    	            return null; 
										  }
										})(),
      										settlementHash: set.blockHash
									})) }); } ).then(()=>ans) )));
  	}).then(()=>{console.log(JSON.stringify(ans)); return ans}));
  },
  createLoan: createLoanResolver,
  initiateSettlement: initiateSettlementResolver,
  confirmSettlement: confirmSettlementResolver,
  tickSettlements: tickSettlementsResolver,
  happyState: happyStateResolver
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
