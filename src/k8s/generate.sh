#! /bin/bash

set -e
THISDIR=$(dirname $0)
DIR=/tmp/k8sgen
rm -rf $DIR
mkdir -p $DIR
npx @hey-api/openapi-ts -i https://raw.githubusercontent.com/kubernetes/kubernetes/v1.30.1/api/openapi-spec/swagger.json -o $DIR

# this horrible awk script removes the duplicate path field...
awk '/{/,/}/ {
    if ($0 ~ /path\??: string;/ && seen_path) {
        next
    }
    if ($0 ~ /path\??: string;/) {
        seen_path=1
    }
}
/}/ {
    seen_path=0
}
{ print }' $DIR/types.gen.ts > $THISDIR/types.gen.ts
rm -rf $DIR