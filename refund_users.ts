import { web3 } from "@project-serum/anchor";
import { Cluster, Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";

if (process.argv.length < 3) {
    console.log("please enter user file name as argument");
}
import { readFileSync }  from 'fs';
let fileName = process.argv[2];

interface Users {
    publicKey: string;
    secretKey: any;
    mangoAccountPks: string,
}

export async function main(users: Users[]) {
    // cluster should be in 'devnet' | 'mainnet' | 'localnet' | 'testnet'  
    const endpoint = process.env.ENDPOINT_URL || 'http://localhost:8899';
    const connection = new Connection(endpoint, 'confirmed');
    const authority = Keypair.fromSecretKey(
        Uint8Array.from(
          JSON.parse(
            process.env.KEYPAIR ||
              readFileSync('authority.json', 'utf-8'),
          ),
        ),
      );
    let promises : Promise<String>[]= []
    let blockHash = await connection.getLatestBlockhash();
    for (const user of users) {
        let userPubkey = new web3.PublicKey(user.publicKey)
        const ix = SystemProgram.transfer({
            fromPubkey: authority.publicKey,
            lamports: LAMPORTS_PER_SOL,
            toPubkey: userPubkey,
        })
        let tx = new web3.Transaction().add(ix);
        tx.recentBlockhash = blockHash.blockhash;
        promises.push(connection.sendTransaction(tx, [authority]))
    }
    await Promise.all(promises)
}
const file = readFileSync(fileName, 'utf-8');
const users : Users[] = JSON.parse(file);
if (users === undefined) {
    console.log("cannot read users list")
}
console.log('refunding 1 sol to ' + users.length + " users")
main(users).then(x => {
    console.log('finished sucessfully')
}).catch(e => {
    console.log('caught an error : ' + e)
})