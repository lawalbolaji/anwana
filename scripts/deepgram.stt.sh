curl -w "@./scripts/curl_format.txt" -so /dev/null --request POST \
     --header "Content-Type: application/json" \
     --header "Authorization: Token ${DEEPGRAM_API_KEY}" \
     --output your_output_file.mp3 \
     --data '{"text":"Hello, how can I help you today?"}' \
     --url "https://api.deepgram.com/v1/speak?model=aura-asteria-en"