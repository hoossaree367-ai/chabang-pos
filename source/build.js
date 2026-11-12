const esbuild=require('esbuild'),fs=require('fs');
(async()=>{
 const fake=process.argv[2]==='fake';
 const r=await esbuild.build({entryPoints:['src/app.js'],bundle:true,minify:true,format:'iife',target:'es2020',write:false,charset:'utf8',legalComments:'none',
  plugins:fake?[{name:'f',setup(b){b.onResolve({filter:/backend\.js$/},()=>({path:require('path').resolve('test/fake-backend.js')}))}}]:[]});
 const js=r.outputFiles[0].text.replace(/<\/script/g,'<\\/script');
 const out=fake?'test/out':'dist';fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(out+'/index.html',fs.readFileSync('src/template.html','utf8').replace('/*BUNDLE*/',()=>js));
 console.log(out,(js.length/1024|0)+'KB');
})();
