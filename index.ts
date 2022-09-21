import { MangoUtils } from "./mango_utils";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

async function main() {
    const connection = new Connection('http://localhost:8899', 'confirmed')
    const authority = Keypair.generate();

    const signature =  await connection.requestAirdrop(authority.publicKey, LAMPORTS_PER_SOL * 1000);
    const blockHash = await connection.getRecentBlockhash('confirmed');
    const blockHeight = await connection.getBlockHeight('confirmed')
    connection.confirmTransaction({signature: signature, blockhash: blockHash.blockhash, lastValidBlockHeight: blockHeight});

    const mangoProgramId = new PublicKey('BXhdkETgbHrr5QmVBT1xbz3JrMM28u5djbVtmTUfmFTH')
    const dexProgramId = new PublicKey('3qx9WcNPw4jj3v1kJbWoxSN2ZAakwUXFu9HDr2QjQ6xq');
    const mangoUtils = new MangoUtils(connection, authority, mangoProgramId, dexProgramId);

    const cookie = await mangoUtils.createMangoCookie(['SOL', 'BTC', 'ETH', 'AVAX'])

    console.log(cookie)    
} 

main().then(x=> {
    console.log('finished sucessfully')
}).catch(e => {
    console.log('caught an erro : ' + e)
})
