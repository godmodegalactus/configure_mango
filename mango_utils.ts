import * as anchor from '@project-serum/anchor';
import { Market, OpenOrders } from "@project-serum/serum";
import * as mango_client_v3 from '@blockworks-foundation/mango-client';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import {
  NATIVE_MINT,
  Mint,
  TOKEN_PROGRAM_ID,
  MintLayout,
} from "@solana/spl-token";

import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  Signer,
} from '@solana/web3.js';
import {SerumUtils,} from "./serum_utils";
import {PythUtils} from "./pyth_utils";
import { MintUtils, TokenData, } from './mint_utils';
import { BN } from 'bn.js';
import { GroupConfig, OracleConfig, PerpMarketConfig, SpotMarketConfig, TokenConfig, Cluster } from '@blockworks-foundation/mango-client';
import { token } from '@project-serum/anchor/dist/cjs/utils';
import { Config } from './config';

export interface PerpMarketData {
    publicKey: PublicKey,
    asks : PublicKey,
    bids : PublicKey,
    eventQ : PublicKey,
}

export interface MangoTokenData extends TokenData {
    rootBank : PublicKey;
    nodeBank : PublicKey;
    marketIndex: number;
    perpMarket : PerpMarketData;
}

export interface MangoCookie {
    mangoGroup : PublicKey;
    signerKey: PublicKey;
    mangoCache : PublicKey;
    usdcRootBank: PublicKey;
    usdcNodeBank: PublicKey;
    usdcMint : PublicKey;
    tokens : Map<String, MangoTokenData>;
    MSRM : PublicKey;
}

export class MangoUtils {
    private conn: Connection;
    private serumUtils : SerumUtils;
    private mintUtils : MintUtils;
    private mangoClient : mango_client_v3.MangoClient;
    private authority: Keypair;
    private mangoProgramId : PublicKey;
    private dexProgramId: PublicKey;

    constructor(conn: Connection, authority:Keypair, mangoProgramId: PublicKey, dexProgramId: PublicKey,){
        this.conn = conn;
        this.authority = authority;
        this.mangoProgramId = mangoProgramId;
        this.dexProgramId = dexProgramId;

        this.serumUtils = new SerumUtils(conn, authority, dexProgramId);
        this.mintUtils = new MintUtils(conn, authority, dexProgramId);
        this.mangoClient = new mango_client_v3.MangoClient(conn, mangoProgramId);
    }

    async createAccountForMango(size : number) : Promise<PublicKey> {
        const lamports = await this.conn.getMinimumBalanceForRentExemption(size);
        let address = Keypair.generate();

        const transaction = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: this.authority.publicKey,
                newAccountPubkey: address.publicKey,
                lamports,
                space: size,
                programId: this.mangoProgramId,
            }))

        transaction.feePayer = this.authority.publicKey;
        let hash = await this.conn.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await sendAndConfirmTransaction(
            this.conn,
            transaction,
            [this.authority, address],
            { commitment: 'confirmed' },
        );

        // airdrop all mongo accounts 1000 SOLs
        // const signature =  await this.conn.requestAirdrop(address.publicKey, LAMPORTS_PER_SOL * 1000);
        // const blockHash = await this.conn.getRecentBlockhash('confirmed');
        // const blockHeight = await this.conn.getBlockHeight('confirmed')
        // await this.conn.confirmTransaction({signature: signature, blockhash: blockHash.blockhash, lastValidBlockHeight: blockHeight});
        return address.publicKey;
    }

    public async createMangoCookie(tokensList: Array<String>) : Promise<MangoCookie> {

        const size = mango_client_v3.MangoGroupLayout.span;
        let group_address = await this.createAccountForMango( size);
        let root_bank_address = await this.createAccountForMango(mango_client_v3.RootBankLayout.span);
        let node_bank_address = await this.createAccountForMango(mango_client_v3.NodeBankLayout.span);
        let mango_cache = await this.createAccountForMango(mango_client_v3.MangoCacheLayout.span);

        const { signerKey, signerNonce } = await mango_client_v3.createSignerKeyAndNonce(
            this.mangoProgramId,
            group_address,
          );

        let mangoCookie: MangoCookie = {
            mangoGroup:null,
            signerKey,
            mangoCache:null,
            usdcRootBank:null,
            usdcNodeBank:null,
            tokens:new Map<String, MangoTokenData>(),
            usdcMint: await this.mintUtils.createMint(6),
            MSRM: await this.mintUtils.createMint(6),
        };

        let usdc_vault = await this.mintUtils.createTokenAccount(mangoCookie.usdcMint, this.authority, signerKey);
        splToken.mintTo(this.conn, this.authority, mangoCookie.usdcMint, usdc_vault, this.authority, 1000000 * 1000000);

        let insurance_vault = await this.mintUtils.createTokenAccount(mangoCookie.usdcMint, this.authority, signerKey);
        splToken.mintTo(this.conn, this.authority, mangoCookie.usdcMint, insurance_vault, this.authority, 1000000 * 1000000);

        let fee_vault = await this.mintUtils.createTokenAccount(mangoCookie.usdcMint, this.authority, TOKEN_PROGRAM_ID);
        splToken.mintTo(this.conn, this.authority, mangoCookie.usdcMint, fee_vault, this.authority, 1000000 * 1000000);

        let msrm_vault = await this.mintUtils.createTokenAccount(mangoCookie.MSRM, this.authority, signerKey);
        mangoCookie.usdcRootBank = root_bank_address;
        mangoCookie.usdcNodeBank = node_bank_address;
        
        
        console.log('mango program id : ' + this.mangoProgramId)
        console.log('serum program id : ' + this.dexProgramId)

        let ix = mango_client_v3.makeInitMangoGroupInstruction(
            this.mangoProgramId,
            group_address,
            signerKey,
            this.authority.publicKey,
            mangoCookie.usdcMint,
            usdc_vault,
            node_bank_address,
            root_bank_address,
            insurance_vault,
            PublicKey.default,
            fee_vault,
            mango_cache,
            this.dexProgramId,
            new anchor.BN(signerNonce),
            new anchor.BN(10),
            mango_client_v3.I80F48.fromNumber(0.7),
            mango_client_v3.I80F48.fromNumber(0.06),
            mango_client_v3.I80F48.fromNumber(1.5),
          );

        let ixCacheRootBank = mango_client_v3.makeCacheRootBankInstruction( this.mangoProgramId,
            group_address,
            mango_cache,
            [root_bank_address]);

        let ixupdateRootBank = mango_client_v3.makeUpdateRootBankInstruction( this.mangoProgramId,
                group_address,
                mango_cache,
                root_bank_address,
                [node_bank_address]);
        
        await this.processInstruction(ix, [this.authority]);
        await this.processInstruction(ixCacheRootBank, [this.authority]);
        await this.processInstruction(ixupdateRootBank, [this.authority]);

        mangoCookie.mangoGroup = group_address;
        mangoCookie.mangoCache = mango_cache;
        console.log('Mango group created, creating tokens')
        await Promise.all( tokensList.map((tokenStr, tokenIndex) => this.createMangoToken(mangoCookie, tokenStr, tokenIndex, 6, 100)));

        return mangoCookie;
    }

    public async createMangoToken(mangoCookie: MangoCookie, tokenName: String, tokenIndex : number, nbDecimals, startingPrice ) : Promise<MangoTokenData> {
        console.log('Creating token '+ tokenName)
        const tokenData = await this.mintUtils.createNewToken(mangoCookie.usdcMint, nbDecimals, startingPrice);
        let mangoTokenData : MangoTokenData = {
            market : tokenData.market,
            marketIndex: tokenIndex,
            mint: tokenData.mint,
            priceOracle: tokenData.priceOracle,
            nbDecimals: tokenData.nbDecimals,
            startingPrice: startingPrice,
            nodeBank: await this.createAccountForMango(mango_client_v3.NodeBankLayout.span),
            rootBank: await this.createAccountForMango(mango_client_v3.RootBankLayout.span),
            perpMarket: null,
        };
        // add oracle to mango
        let add_oracle_ix = mango_client_v3.makeAddOracleInstruction(
            this.mangoProgramId,
            mangoCookie.mangoGroup,
            mangoTokenData.priceOracle.publicKey,
            this.authority.publicKey,
        );
        const transaction = new Transaction();
        transaction.add(add_oracle_ix);;
        transaction.feePayer = this.authority.publicKey;
        let hash = await this.conn.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await sendAndConfirmTransaction(
            this.conn,
            transaction,
            [this.authority],
            { commitment: 'confirmed' },
        );
        await this.initSpotMarket(mangoCookie, mangoTokenData);
        mangoTokenData.perpMarket = await this.createAndInitPerpMarket(mangoCookie, mangoTokenData);
        mangoCookie.tokens.set(tokenName, mangoTokenData);
        return mangoTokenData;
    }

    public async initSpotMarket(mangoCookie: MangoCookie, token : MangoTokenData) {

        const vault = await this.mintUtils.createTokenAccount( token.mint, this.authority, mangoCookie.signerKey);
        // add spot market to mango
        let add_spot_ix = mango_client_v3.makeAddSpotMarketInstruction(
            this.mangoProgramId,
            mangoCookie.mangoGroup,
            token.priceOracle.publicKey,
            token.market.address,
            this.dexProgramId,
            token.mint,
            token.nodeBank,
            vault,
            token.rootBank,
            this.authority.publicKey,
            mango_client_v3.I80F48.fromNumber(10),
            mango_client_v3.I80F48.fromNumber(5),
            mango_client_v3.I80F48.fromNumber(0.05),
            mango_client_v3.I80F48.fromNumber(0.7),
            mango_client_v3.I80F48.fromNumber(0.06),
            mango_client_v3.I80F48.fromNumber(1.5),
        );

        let ixCacheRootBank = mango_client_v3.makeCacheRootBankInstruction(this.mangoProgramId,
            mangoCookie.mangoGroup,
            mangoCookie.mangoCache,
            [token.rootBank]);

        let ixupdateRootBank = mango_client_v3.makeUpdateRootBankInstruction(this.mangoProgramId,
            mangoCookie.mangoGroup,
            mangoCookie.mangoCache,
            token.rootBank,
            [token.nodeBank]);

        const transaction = new Transaction();
        transaction.add(add_spot_ix);
        transaction.add(ixCacheRootBank);
        transaction.add(ixupdateRootBank);
        transaction.feePayer = this.authority.publicKey;
        let hash = await this.conn.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        await this.mangoClient.sendTransaction(transaction, this.authority, [])
    }

    public async getMangoGroup(mangoCookie: MangoCookie) {
        return this.mangoClient.getMangoGroup(mangoCookie.mangoGroup)
    }

    public async createAndInitPerpMarket(mangoCookie: MangoCookie, token: MangoTokenData) : Promise<PerpMarketData> {
        await this.mangoClient.addPerpMarket(
            await this.getMangoGroup(mangoCookie),
            token.priceOracle.publicKey,
            token.mint,
            this.authority,
            10,
            5,
            0.05,
            0,
            0.0005,
            1000,
            1000,
            256,
            1,
            200,
            3600,
            0,
            2,
          );

        const mangoGroup = await this.mangoClient.getMangoGroup(mangoCookie.mangoGroup);
        const tokenIndex = token.marketIndex;
        const perpMarketPk = mangoGroup.perpMarkets[tokenIndex].perpMarket
        const perpMarket = await this.mangoClient.getPerpMarket(perpMarketPk, token.nbDecimals, 6);
        const perpMarketData : PerpMarketData = {
            publicKey: perpMarketPk,
            asks: perpMarket.asks,
            bids: perpMarket.bids,
            eventQ: perpMarket.eventQueue,
        }
        return perpMarketData
    }

    public async refreshTokenCache(mangoCookie: MangoCookie, tokenData : MangoTokenData) {
        
        let ixupdateRootBank = mango_client_v3.makeUpdateRootBankInstruction( this.mangoProgramId,
            mangoCookie.mangoGroup,
            mangoCookie.mangoCache,
            tokenData.rootBank,
            [tokenData.nodeBank]);
        
        const transaction = new Transaction();
        transaction.add(ixupdateRootBank);
        transaction.feePayer = this.authority.publicKey;
        let hash = await this.conn.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await sendAndConfirmTransaction(
            this.conn,
            transaction,
            [this.authority],
            { commitment: 'confirmed' },
        );
    }

    
    public async refreshRootBankCache(mangoContext: MangoCookie) {

        let ixCacheRootBank = mango_client_v3.makeCacheRootBankInstruction(this.mangoProgramId,
            mangoContext.mangoGroup,
            mangoContext.mangoCache,
            Array.from(mangoContext.tokens).map(x=> x[1].rootBank));

        const transaction = new Transaction();
        transaction.add(ixCacheRootBank);
        transaction.feePayer = this.authority.publicKey;
        let hash = await this.conn.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await sendAndConfirmTransaction(
            this.conn,
            transaction,
            [this.authority],
            { commitment: 'confirmed' },
        );
    }

    async refreshAllTokenCache(mangoContext: MangoCookie) {
        await this.refreshRootBankCache(mangoContext);
        await Promise.all(
            Array.from(mangoContext.tokens).map(x=> this.refreshTokenCache(mangoContext, x[1]))
        );
    }

    async createSpotOpenOrdersAccount(mangoContext: MangoCookie, mangoAccount : PublicKey, owner : Keypair, tokenData: TokenData) : Promise<PublicKey> {

        let mangoGroup = await this.mangoClient.getMangoGroup(mangoContext.mangoGroup);
        const marketIndex = new BN( mangoGroup.tokens.findIndex(x=> x.mint.equals(tokenData.mint)) );

        const [spotOpenOrdersAccount, _bump] = await PublicKey.findProgramAddress(
                [
                    mangoAccount.toBuffer(), 
                    marketIndex.toBuffer("le", 8), 
                    Buffer.from("OpenOrders"),
                ], this.mangoProgramId);
        
        const space = OpenOrders.getLayout(this.dexProgramId).span;
        //await this.createAccount( spotOpenOrdersAccount, owner, DEX_ID, space);
        const lamports = await this.conn.getMinimumBalanceForRentExemption(space);

        let ix2 = mango_client_v3.makeCreateSpotOpenOrdersInstruction(
            this.mangoProgramId,
            mangoContext.mangoGroup,
            mangoAccount,
            owner.publicKey,
            this.dexProgramId,
            spotOpenOrdersAccount,
            tokenData.market.address,
            mangoContext.signerKey,
        )
        await this.processInstruction(ix2, [owner]);

        return spotOpenOrdersAccount;
    }

    async processInstruction(ix: anchor.web3.TransactionInstruction, signers:Array<Signer>)
    {
        const transaction = new Transaction();
        transaction.add(ix);
        transaction.feePayer = this.authority.publicKey;
        signers.push(this.authority);
        let hash = await this.conn.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        try{
            await this.mangoClient.sendTransaction(transaction,
                this.authority,
                [],);

        }
        catch(ex)
        { 
            const ext = ex as anchor.web3.SendTransactionError;
            if (ext != null) {
                console.log("Error processing instruction : " + ext.message)
            }
            throw ex;
        }
    }

    convertCookie2Json(mangoCookie: MangoCookie) {
        const oracles = Array.from(mangoCookie.tokens).map(x => {
            const oracle : OracleConfig = {
                publicKey: x[1].priceOracle.publicKey,
                symbol: x[0] + 'USDC'
            }
            return oracle;
        })

        const perpMarkets = Array.from(mangoCookie.tokens).map(x=> {
            const perpMarket : PerpMarketConfig= {
                publicKey: x[1].perpMarket.publicKey,
                asksKey: x[1].perpMarket.asks,
                bidsKey: x[1].perpMarket.bids,
                eventsKey: x[1].perpMarket.eventQ,
                marketIndex: x[1].marketIndex,
                baseDecimals: x[1].nbDecimals,
                baseSymbol: x[0].toString(),
                name: (x[0] + 'USDC PERP'),
                quoteDecimals: 6, 
            }
            return perpMarket
        })

        const spotMarkets = Array.from(mangoCookie.tokens).map( x=> {
            
            const spotMarket : SpotMarketConfig = {
                name : x[0] + 'USDC Top Market',
                marketIndex: x[1].marketIndex,
                publicKey: x[1].market.address,
                asksKey: x[1].market.asksAddress,
                bidsKey: x[1].market.bidsAddress,
                baseDecimals: x[1].nbDecimals,
                baseSymbol: x[0].toString(),
                eventsKey: x[1].market.decoded.eventQueue,
                quoteDecimals: 6,
            }
            return spotMarket;
        })

        const tokenConfigs = Array.from(mangoCookie.tokens).map(x=> {
            const tokenConfig : TokenConfig = {
                decimals: x[1].nbDecimals,
                mintKey: x[1].mint,
                nodeKeys: [x[1].nodeBank],
                rootKey: x[1].rootBank,
                symbol: x[0].toString(),
            }
            return tokenConfig
        })

        const groupConfig : GroupConfig = {
            cluster :'localnet',
            mangoProgramId: this.mangoProgramId,
            name: 'localnet',
            publicKey: mangoCookie.mangoGroup,
            quoteSymbol: "USDC",
            oracles: oracles,
            serumProgramId: this.dexProgramId,
            perpMarkets: perpMarkets,
            spotMarkets: spotMarkets,
            tokens: tokenConfigs,
        }

        const groupConfigs : GroupConfig[] = [groupConfig]
        const cluster_urls : Record<Cluster, string> = {"devnet": "https://mango.devnet.rpcpool.com",
        "localnet": "http://127.0.0.1:8899",
        "mainnet": "https://mango.rpcpool.com/946ef7337da3f5b8d3e4a34e7f88",
        "testnet": "http://api.testnet.rpcpool.com"};

        const config = new Config ( cluster_urls, groupConfigs );
        return config.toJson();
    }
}
