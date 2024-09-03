import * as splToken from "@solana/spl-token";
import {
    PublicKey,
    Connection,
    Keypair,
} from "@solana/web3.js";

import { Market, OpenOrders } from "@project-serum/serum";
import { PythUtils } from "./pyth_utils";
import { SerumUtils } from "./serum_utils";
import { web3 } from "@project-serum/anchor";
import { MangoCookie, MangoUser, MangoUtils } from "./mango_utils";

export interface TokenData {
    mint : PublicKey,
    market : Market | undefined,
    startingPrice : number,
    nbDecimals: number,
    priceOracle: Keypair | undefined,
}

export interface TokenAccountData {
    pubkey: PublicKey,
    mint: PublicKey,
    amount : bigint,
}

export class MintUtils {

    private conn: Connection;
    private authority: Keypair;

    private recentBlockhash: string;
    private pythUtils : PythUtils;
    private serumUtils : SerumUtils;


    constructor(conn: Connection, authority: Keypair, dexProgramId: PublicKey, pythProgramId: PublicKey) {
        this.conn = conn;
        this.authority = authority;
        this.recentBlockhash = "";
        this.pythUtils = new PythUtils(conn, authority, pythProgramId);
        this.serumUtils = new SerumUtils(conn, authority, dexProgramId);
    }

    async createMint(nb_decimals = 6) : Promise<PublicKey> {
        const kp = Keypair.generate();
        return await splToken.createMint(this.conn, 
            this.authority, 
            this.authority.publicKey, 
            this.authority.publicKey, 
            nb_decimals,
            kp)
    }

    public async updateTokenPrice(tokenData: TokenData, newPrice: number) {
        this.pythUtils.updatePriceAccount(tokenData.priceOracle, 
            {
                exponent: tokenData.nbDecimals,
                aggregatePriceInfo: {
                price: BigInt(newPrice),
                conf: BigInt(newPrice * 0.01),
                },
            });
    }

    public async createNewToken(quoteToken: PublicKey, nbDecimals = 6, startingPrice = 1_000_000) {
        const mint = await this.createMint(nbDecimals);
        const tokenData : TokenData = { 
            mint: mint,
            market : await this.serumUtils.createMarket({
                baseToken : mint,
                quoteToken: quoteToken,
                baseLotSize : 1000,
                quoteLotSize : 1000,
                feeRateBps : 0,
            }),
            startingPrice : startingPrice,
            nbDecimals: nbDecimals,
            priceOracle : await this.pythUtils.createPriceAccount(),
        };
        await this.updateTokenPrice(tokenData, startingPrice)
        return tokenData;
    }

    public async getTokenAccounts(owner: PublicKey) : Promise<TokenAccountData[]> {
        let token_accounts = await this.conn.getTokenAccountsByOwner(owner, {
            programId: splToken.TOKEN_PROGRAM_ID
        }, 'finalized');

        return token_accounts.value.map(x =>{
            let account = x.account;
            let token_account =  splToken.AccountLayout.decode(account.data);
            let return_data : TokenAccountData = {
                pubkey: x.pubkey,
                mint: token_account.mint,
                amount: token_account.amount,
            };
            return return_data;
        })
    }

    public async createTokenAccount(mint: PublicKey, payer: Keypair, owner: PublicKey) {
        const account = Keypair.generate();
        return splToken.createAccount(
            this.conn,
            payer,
            mint,
            owner,
            account
        )
    }

    public async printUsersTokenAccounts(mangoCookie: MangoCookie, users: MangoUser[], authority: Keypair ) {
        let authority_token_data = await this.getTokenAccounts(authority.publicKey);
        let usdc_token_data = authority_token_data.find(x => x.mint == mangoCookie.usdcMint);
        
        let acc = await this.conn.getAccountInfo(authority.publicKey);
        console.log("authority : " + authority.publicKey.toString())
        console.log("authority has "+ (acc.lamports/ 1_000_000_000).toString() + " SOL")
        // console.log("authority has "+ usdc_token_data.amount.toString() + " USDC")
        // for (let token of mangoCookie.tokens) {
        //     let token_data = authority_token_data.find(x => x.mint == token[1].mint);
        //     console.log("authority has" + token_data.amount.toString() + " " + token[0])
        // }

        let iter = 0;
        for (let user of users) {
            let token_data = await this.getTokenAccounts(user.kp.publicKey);

            let acc = await this.conn.getAccountInfo(user.kp.publicKey);
            let us = "user" + iter.toString();
            iter += 1;
            console.log("us : " + user.kp.publicKey.toString())
            console.log(us + " has "+ (acc.lamports/ 1_000_000_000).toString() + " SOL")
            console.log(us + "authority has "+ usdc_token_data.amount.toString() + " USDC")
            for (let token of mangoCookie.tokens) {
                let td = token_data.find(x => x.mint == token[1].mint);
                console.log(us + " has" + td.amount.toString() + " " + token[0])
            }
        }
    }
}