import * as splToken from "@solana/spl-token";
import {
    PublicKey,
    Connection,
    Keypair,
} from "@solana/web3.js";

import { Market, OpenOrders } from "@project-serum/serum";
import { PythUtils } from "./pyth_utils";
import { SerumUtils } from "./serum";

export interface TokenData {
    mint : PublicKey,
    market : Market | undefined,
    starting_price : number,
    priceOracle: Keypair | undefined,
}

export class MintUtils {

    private conn: Connection;
    private authority: Keypair;

    private recentBlockhash: string;
    private pythUtils : PythUtils;
    private serumUtils : SerumUtils;


    constructor(conn: Connection, authority: Keypair) {
        this.conn = conn;
        this.authority = authority;
        this.recentBlockhash = "";
        this.pythUtils = new PythUtils(conn, authority)
        this.serumUtils = new SerumUtils(conn, authority)
    }

    async createMint(nb_decimals = 6) : Promise<PublicKey> {

        return await splToken.createMint(this.conn, 
            this.authority, 
            this.authority.publicKey, 
            this.authority.publicKey, 
            nb_decimals,)
    }

    public async createNewToken(quoteToken: PublicKey, nb_decimals = 6, starting_price = 1_000_000) {
        const mint = await this.createMint(nb_decimals);
        const tokenData : TokenData = { 
            mint: await this.createMint(nb_decimals),
            market : await this.serumUtils.createMarket({
                baseToken : mint,
                quoteToken: quoteToken,
                baseLotSize : 1000,
                quoteLotSize : 1000,
                feeRateBps : 0,
            }),
            starting_price : 1,
            priceOracle : await this.pythUtils.createPriceAccount(),
        };
        return tokenData;
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
}