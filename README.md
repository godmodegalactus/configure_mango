This code is to configure mango group, tokens, spot market, perp markets and oracles on local solana validator and create 50 mango user accounts.
It will create authority.json, accounts-20.json and ids.json.

From the root directory of this project do:

To install all the dependancies
`npm install`

To start a solana test validator
`sh start-test-validator.sh`
Or
To start a local solana validator
`sh configure_local.sh`

To configure mango
`ts-node index.ts`

To run mango keeper
`ts-node keeper.ts`

Pyth oracle is a mock it is a program which will just rewrite an account with a binary data.