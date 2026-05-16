const { MongoClient } = require('mongodb');
const uri = "mongodb+srv://Guruji:harshil@joblisting.l6oinrp.mongodb.net/docuflex?retryWrites=true&w=majority&appName=Joblisting";

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('docuflex');
    const collections = await db.listCollections().toArray();
    console.log('Collections in docuflex:');
    collections.forEach(c => console.log(` - ${c.name}`));
    
    const users = await db.collection('users').find().toArray();
    console.log(`Found ${users.length} users in 'users' collection.`);
    if (users.length > 0) {
      console.log('First user email:', users[0].email);
    }

    const allDbs = await client.db().admin().listDatabases();
    console.log('All databases:');
    allDbs.databases.forEach(d => console.log(` - ${d.name}`));

  } finally {
    await client.close();
  }
}
run().catch(console.dir);
