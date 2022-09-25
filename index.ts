import { MangoUtils } from "./mango_utils";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { sleep } from "@blockworks-foundation/mango-client";

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

async function main() {
    const connection = new Connection('http://localhost:8899', 'confirmed');
    console.log('transaction-count' + await connection.getTransactionCount())
    console.log('Connecting to cluster')
    const authority = Keypair.generate();


    console.log('Configuring authority')
    const signature =  await connection.requestAirdrop(authority.publicKey, LAMPORTS_PER_SOL * 1000);
    const blockHash = await connection.getRecentBlockhash('confirmed');
    const blockHeight = await connection.getBlockHeight('confirmed')
    await connection.confirmTransaction({signature: signature, blockhash: blockHash.blockhash, lastValidBlockHeight: blockHeight});
    const beginSlot = await connection.getSlot();
    console.log('Creating Mango Cookie')
    const mangoProgramId = new PublicKey('BXhdkETgbHrr5QmVBT1xbz3JrMM28u5djbVtmTUfmFTH')
    const dexProgramId = new PublicKey('3qx9WcNPw4jj3v1kJbWoxSN2ZAakwUXFu9HDr2QjQ6xq');
    const logId = connection.onLogs(mangoProgramId, (log, ctx) => {
        if (log.err != null ){
            console.log("mango error : " + log.err.toString())
        }
        else {
            for(const l of log.logs) {
                console.log("mango log : " + l)
            }
        }
    });
    try{
        const mangoUtils = new MangoUtils(connection, authority, mangoProgramId, dexProgramId);

        const cookie = await mangoUtils.createMangoCookie(['SOL', 'BTC', 'ETH', 'AVAX', 'SRM', 'FTT'])

        console.log(cookie)
    } finally {
        // to log mango logs
        // await sleep(5000)
        // const endSlot = await connection.getSlot();
        // const blockSlots = await connection.getBlocks(beginSlot, endSlot);
        // for (let blockSlot of blockSlots) {
        //     const block = await connection.getBlock(blockSlot);
        //     for (let i =0; i<block.transactions.length; ++i){
        //         if(block.transactions[i].meta.logMessages)
        //         {
        //             for(const msg of block.transactions[i].meta.logMessages)
        //             {
        //                 console.log('solana_message : ' + msg);
        //             }
        //         }
        //     }
        // }
        connection.removeOnLogsListener(logId);
    }    
} 

main().then(x=> {
    console.log('finished sucessfully')
}).catch(e => {
    console.log('caught an error : ' + e)
})
