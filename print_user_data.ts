import { web3 } from "@project-serum/anchor";
import { Cluster, Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { PublicKey, sleep } from "@blockworks-foundation/mango-client";
import { getProgramMap } from "./utils/config"

if (process.argv.length < 3) {
    console.log("please enter user file name as argument");
}

import { readFileSync }  from 'fs';
import { MangoCookie, MangoUser, MangoUserId, MangoUtils } from "./utils/mango_utils";
import { MintUtils } from "./utils/mint_utils";
let user_files = process.argv[2];
let mango_cookie_file = process.argv[3];
let authority_file = 'authority.json';
if (process.argv.length >= 4) {
    authority_file = process.argv[4];
}

interface Users {
    publicKey: string;
    secretKey: any;
    mangoAccountPks: string,
}

enum Result {
    SUCCESS = 0,
    FAILURE = 1
};

function convert_to_mango_user(user: Users) : MangoUserId {
    let mangoAddressStr : String = user.mangoAccountPks[0]
    let mango_user : MangoUserId = {
        pubkey: new PublicKey(user.publicKey),
        mangoAddress: new PublicKey(mangoAddressStr)
    };
    return mango_user
}

export async function main(users: Users[],
    authority: Keypair,
    mango_cookie: MangoCookie,
) {
    // cluster should be in 'devnet' | 'mainnet' | 'localnet' | 'testnet'  
    const endpoint = process.env.ENDPOINT_URL || 'http://localhost:8899';
    const connection = new Connection(endpoint, 'confirmed');
    let mango_utils = new MangoUtils(connection, authority, PublicKey.default, PublicKey.default, PublicKey.default)
    
    await mango_utils.printMangoAccounts(mango_cookie, users.map(x => convert_to_mango_user(x)));
    return Result.SUCCESS;
}

const file = readFileSync(user_files, 'utf-8');
const users : Users[] = JSON.parse(file);

const file2 = readFileSync(mango_cookie_file, 'utf-8');
const mango_cookie : MangoCookie = JSON.parse(file2);

if (users === undefined) {
    console.log("cannot read users list")
}


if (mango_cookie === undefined) {
    console.log("cannot read mango_cookie")
}

const authority = Keypair.fromSecretKey(
    Uint8Array.from(
        JSON.parse(
            process.env.KEYPAIR ||
                readFileSync(authority_file, 'utf-8'),
        ),
    ),
);
main(users, authority, mango_cookie).then(x => {
    if (x == Result.SUCCESS) {
        console.log('finished sucessfully')
        process.exit(0);
    } else {
        console.log('failed')
        process.exit(1);
    }
});
