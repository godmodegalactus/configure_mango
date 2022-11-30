#!/usr/bin/env bash

URL_OR_MONIKER="${URL_OR_MONIKER:=http://0.0.0.0:8899}"
soFiles=("spl_token-3.5.0.so" "spl_memo-1.0.0.so" "spl_memo-3.0.0.so" "spl_associated-token-account-1.1.1.so" "spl_feature-proposal-1.0.0.so" "mango.so" "serum_dex.so" "pyth_mock.so")
DEPLOY_PROGRAM="solana program deploy -u ${URL_OR_MONIKER} --use-quic"
mkdir -p program-keypairs
for program in ${soFiles[@]}; do
    keypair="./program-keypairs/${program%.*}.json"
    solana-keygen new --no-passphrase -so ${keypair}
    ${DEPLOY_PROGRAM} --program-id ${keypair} bin/${program}
done
