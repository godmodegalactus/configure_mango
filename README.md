# Configure mango - A faster and easier way to configure mango for a cluster

This code can be used to configure mango group, tokens, spot market, perp markets and oracles on local solana validator and create 50 mango user accounts.
It will create authority.json which is keypair of authority file, accounts-20.json which contains all user data and ids.json which contains info about mango group.

The project also contains necessary binary files. You can always update the binary files by compiling from source and replacing the binaries locally. You have to apply bin/mango.patch to your mango repository to use it to create a local cluster.
From the root directory of this project do:

## How to use

To install all the dependencies : 
```sh
npm install && yarn add @blockworks-foundation/mango-client
```

To start a solana test validator
```sh
sh start-test-validator.sh
```
Or
To start a local solana validator
```sh
sh configure_local.sh
```

To configure mango
```sh
ts-node index.ts
```

To run mango keeper
```sh
ts-node keeper.ts
```

Pyth oracle is a mock it is a program which will just rewrite an account with a binary data.