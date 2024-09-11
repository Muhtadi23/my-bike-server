// ======================= project setup ===========================
const express = require('express')
const app = express();
const cors = require('cors')
const jwt = require('jsonwebtoken')
const stripe = require('stripe')('sk_test_51PFuVZRqf7kNrGXGQ8SektsX7SNnMzkFYVqcTDXQ062OT7FnTFmyITox2t4i1OjpaZk9AOKHS1bp0J2a5EN2bb4s00Np6tFxdt')
require('dotenv').config()
const port = process.env.PORT || 5002;
// ============================================

// middleware
app.use(cors())
app.use(express.json())
//======================================================


// bikeUser
// qcGNpfj0fSidcAdp


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://bikeUser:${process.env.DB_PASS}@cluster0.hsef1tq.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();


        //***************  Collection Names ******************
        const blogCollection = client.db("bikeDB").collection("blog");
        const productsCollection = client.db("bikeDB").collection("products");
        const cartsCollection = client.db("bikeDB").collection("carts");
        const usersCollection = client.db("bikeDB").collection("users");
        const paymentsCollection = client.db("bikeDB").collection("payments");


        // JWT related API
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
            res.send({ token })
        })

        // verification middlewares
        const verifyToken = (req, res, next) => {
            // console.log('inside verifyToken', req.headers.authorization)
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization
            jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ massage: 'unauthorize access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // ***********----- Payment Intent ------ ********************
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100)
            console.log(amount)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment related API
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentsCollection.insertOne(payment)

            // carefully delete each item from the cart
            console.log('payment info', payment)
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            }
            const deleteResult = await cartsCollection.deleteMany(query)
            res.send({ paymentResult, deleteResult })
        })

        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const result = await paymentsCollection.find(query).toArray();
            res.send(result);
        })
        // stats and analytics
        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const users = await usersCollection.estimatedDocumentCount()
            const productItems = await productsCollection.estimatedDocumentCount()
            const orders = await paymentsCollection.estimatedDocumentCount()

            // this in not the best way
            // const payments = await paymentsCollection.find().toArray()
            // const revenue = payments.reduce((total, payment) => total + payment.price, 0)
            const result = await paymentsCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$price" }
                    }
                }
            ]).toArray()

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({
                users,
                productItems,
                orders,
                revenue
            })
        })

        //***********----- BLOG API ------ ********************
        // post method to create/upload blogs
        app.post('/blog', async (req, res) => {
            const newBlog = req.body;
            const result = await blogCollection.insertOne(newBlog)
            res.send(result)
        })
        

        // get method to Read all the created/uploaded data
        app.get('/blog', async (req, res) => {
            const result = await blogCollection.find().toArray();
            res.send(result)
        })

        // get/:id method to Read the single data
        app.get('/blog/:id', async (req, res) => {
            const id = req.params.id
            // the field we wanna query
            const query = { _id: new ObjectId(id) }
            const result = await blogCollection.findOne(query)
            res.send(result)
        })

        // delete method to delete single data
        // almost same as finding single data
        app.delete('/blog/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await blogCollection.deleteOne(query)
            res.send(result)
        })

        // ****************************************
        // Update PUT method
        app.put('/blog/:id', async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updatedBlog = req.body
            // fields we want to update
            const blogg = {
                $set: {
                    // all the fields
                    title: updatedBlog.title,
                    url: updatedBlog.url,
                    content: updatedBlog.content,
                    date: updatedBlog.date
                }
            }
            const result = await blogCollection.updateOne(filter, blogg, options)
            res.send(result)
        })
        // ****************************************

        // ***********-------- Product DB ---------************
        app.get('/products', async (req, res) => {
            const result = await productsCollection.find().toArray();
            res.send(result)
        })

        app.post('/products', async (req, res) => {
            const newProduct = req.body;
            const result = await productsCollection.insertOne(newProduct)
            res.send(result)
        })

        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await productsCollection.findOne(query)
            res.send(result)
        })

        app.put('/products/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateProduct = req.body
            const updatedProduct = {
                $set: {
                    title: updateProduct.title,
                    image: updateProduct.image,
                    price: updateProduct.price
                }
            }
            const result = await productsCollection.updateOne(filter, updatedProduct, options)
            res.send(result)
        })

        app.delete('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await productsCollection.deleteOne(query)
            res.send(result)
        })

        // ***********-------- Cart DB ---------************

        // app.post('/carts', async (req, res) => {
        //     const cartItem = req.body;
        //     const result = await cartsCollection.insertOne(cartItem)
        //     res.send(result)
        // })

        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const { productId, email } = cartItem;

            // Check if the product already exists in the user's cart
            const existingItem = await cartsCollection.findOne({ productId, email });

            if (existingItem) {
                // If the product is already in the cart, update the quantity
                const filter = { _id: existingItem._id };
                const updateDoc = {
                    $set: {
                        quantity: existingItem.quantity + cartItem.quantity
                    }
                };
                const result = await cartsCollection.updateOne(filter, updateDoc);
                res.send(result);
            } else {
                // If the product is not in the cart, insert it as a new item
                const result = await cartsCollection.insertOne(cartItem);
                res.send(result);
            }
        });


        app.put('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const updatedCartItem = req.body;

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    quantity: updatedCartItem.quantity
                }
            };

            const result = await cartsCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await cartsCollection.find(query).toArray();
            res.send(result)
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartsCollection.deleteOne(query)
            res.send(result)
        })

        // ***********-------- Users Related DB ---------************
        // checking user already exist or not
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query)
            if (existingUser) {
                return res.send({ massage: 'User Already exist', insertedId: null })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        // getting all users
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        // user Delete
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await usersCollection.deleteOne(query)
            res.send(result)
        })

        // Make User Admin
        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin',
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ massage: 'unauthorized access' })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            let admin = false;
            if (user) {
                admin = user.role === 'admin'
            }
            res.send({ admin })
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


// ==================part of project setup =================
app.get('/', (req, res) => {
    res.send('Bike Server is running')
})

app.listen(port, () => {
    console.log(`myBike Server is running on port: ${port}`)
})
// ==========================================================