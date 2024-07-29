curl -w "@./scripts/curl_format.txt" -so /dev/null --request POST \
     --header "Content-Type: audio/wav" \
     --header "Authorization: Token ${DEEPGRAM_API_KEY}" \
     --data-binary @./public/introduction.mp3 \
     --url 'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true'
