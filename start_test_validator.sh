solana-test-validator --account MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac bin/mango-mint.json &

sleep 5s

solana program deploy bin/mango.so --program-id bin/mango.json
solana program deploy bin/serum_dex.so --program-id bin/serum_dex.json
solana program deploy bin/pyth_mock.so --program-id bin/pyth_mock.json