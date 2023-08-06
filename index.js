const express = require('express');
const app = express();
const cors = require('cors');
const SSLCommerzPayment = require('sslcommerz-lts')
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// verifyJWT user security layer
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' })
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })

}




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dt6wk0t.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// sslcommerz
const store_id = process.env.STORE_ID
const store_passwd = process.env.STORE_PASS
const is_live = false //true for live, false for sandbox




async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("jerinDb").collection("users");
    const serviceCollection = client.db("jerinDb").collection("services");
    const reviewCollection = client.db("jerinDb").collection("reviews");
    const featureCollection = client.db("jerinDb").collection("features");
    const productCollection = client.db("jerinDb").collection("products");
    const teamCollection = client.db("jerinDb").collection("teams");
    const paymentCollection = client.db("jerinDb").collection("payments");

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

      res.send({ token })
    })

    // Warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== 'admin') {
        res.status(403).send({ error: true, message: 'forbidden message' })
      }
      next();
    }


    // users related apis
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })


    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === 'admin' };
      res.send(result)
    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result)

    })

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(filter);
      res.send(result)
    })


    // services apis
    app.get('/services', async (req, res) => {
      const result = await serviceCollection.find().toArray();
      res.send(result);
    })


    // reviews apis
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })


    // features apis
    app.get('/features', async (req, res) => {
      const result = await featureCollection.find().toArray();
      res.send(result)
    })

    app.post('/features', verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await featureCollection.insertOne(newItem);
      res.send(result);
    })

    app.delete('/features/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await featureCollection.deleteOne(query);
      res.send(result);
    })


    // product apis
    app.get('/products', verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([])
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }

      const query = { email: email };
      const result = await productCollection.find(query).toArray();
      res.send(result)
    })


    app.post('/products', async (req, res) => {
      const item = req.body;
      const result = await productCollection.insertOne(item);
      res.send(result)
    })

    // SSLCommerz payment
    const tran_id = new ObjectId().toString();

    app.post('/payments', async (req, res) => {
      const product = await productCollection.findOne({ _id: new ObjectId(req.body.productItemId) });
      const order = req.body;

      const data = {
        total_amount: product?.price,
        currency: order?.currency,
        tran_id: tran_id, // use unique tran_id for each api call
        success_url: `http://localhost:5000/payments/success/${tran_id}`,
        fail_url: `http://localhost:5000/payments/fail/${tran_id}`,
        cancel_url: 'http://localhost:3030/cancel',
        ipn_url: 'http://localhost:3030/ipn',
        shipping_method: 'Courier',
        product_name: order?.product,
        product_category: 'Electronic',
        product_profile: 'general',
        cus_name: order?.name,
        cus_email: order?.email,
        cus_add1: 'Dhaka',
        cus_add2: 'Dhaka',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        cus_phone: '01711111111',
        cus_fax: '01711111111',
        ship_name: 'Customer Name',
        ship_add1: 'Dhaka',
        ship_add2: 'Dhaka',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: 1000,
        ship_country: 'Bangladesh',
      };
      // console.log(data)
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
      sslcz.init(data).then(apiResponse => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL
        res.send({ url: GatewayPageURL })

        const finalOrder = {
          product,
          paidStatus: false,
          transactionId: tran_id
        };
        const result = paymentCollection.insertOne(finalOrder)
        console.log('Redirecting to: ', GatewayPageURL);
      });

      app.post('/payments/success/:tranId', async (req, res) => {
        const result = await paymentCollection.updateOne({transactionId: req.params.tranId}, {
          $set: {
            paidStatus: true,
          }
        });
        if(result.modifiedCount > 0){
          res.redirect(`http://localhost:5173/payments/success/${req.params.tranId}`)
        }
      });

      app.post('payments/fail/:tranId', async(req, res) => {
        const result = await paymentCollection.deleteOne({transactionId: req.params.tranId})

        if(result.deletedCount){
          res.redirect(`http://localhost:5173/payments/fail/${req.params.tranId}`)
        }
      })
    })

    // teams apis
    app.get('/teams', async (req, res) => {
      const result = await teamCollection.find().toArray();
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('jerins is running')
});


app.listen(port, () => {
  console.log(`Jerins parlour is running on port: ${port}`)
})
